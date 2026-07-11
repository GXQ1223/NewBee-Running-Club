#!/usr/bin/env python3
"""
One-time migration: add donation-ledger columns to the donors table.

Adds:
    status            VARCHAR(20) NOT NULL DEFAULT 'confirmed'
    thank_you_sent_at DATETIME NULL
    email_excerpt     TEXT NULL

Safe to re-run: existing columns are detected and skipped. Works on both
SQLite (dev) and MySQL (prod) — run on the EC2 box after deploying:

    cd /var/www/newbeerunning/backend && python migrate_donation_ledger.py
"""

from sqlalchemy import inspect, text

from database import engine


COLUMNS = [
    ("status", "VARCHAR(20) NOT NULL DEFAULT 'confirmed'"),
    ("thank_you_sent_at", "DATETIME NULL"),
    ("email_excerpt", "TEXT NULL"),
]


def migrate():
    inspector = inspect(engine)
    existing = {col["name"] for col in inspector.get_columns("donors")}

    with engine.begin() as conn:
        for name, ddl in COLUMNS:
            if name in existing:
                print(f"Column donors.{name} already exists, skipping.")
                continue
            conn.execute(text(f"ALTER TABLE donors ADD COLUMN {name} {ddl}"))
            print(f"Added column donors.{name}.")

        # Backfill any NULL statuses (SQLite adds the default for new rows
        # only; existing rows get the default via the ADD COLUMN, but be
        # explicit in case a partial run left NULLs behind).
        result = conn.execute(
            text("UPDATE donors SET status = 'confirmed' WHERE status IS NULL")
        )
        if result.rowcount:
            print(f"Backfilled status='confirmed' on {result.rowcount} row(s).")

    print("Donation ledger migration complete.")


if __name__ == "__main__":
    migrate()
