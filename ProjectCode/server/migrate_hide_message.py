#!/usr/bin/env python3
"""
One-time migration: add the hide_message column to the donors table.

Adds:
    hide_message BOOLEAN NOT NULL DEFAULT 0

Committee can flip it per donation to hide an ugly auto-imported payment
message (e.g. Zelle boilerplate) from the public donors page.

Safe to re-run: the existing column is detected and skipped. Works on both
SQLite (dev) and MySQL (prod) — run on the EC2 box after deploying:

    cd /var/www/newbeerunning/backend && python migrate_hide_message.py
"""

from sqlalchemy import inspect, text

from database import engine


COLUMNS = [
    ("hide_message", "BOOLEAN NOT NULL DEFAULT 0"),
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

    print("hide_message migration complete.")


if __name__ == "__main__":
    migrate()
