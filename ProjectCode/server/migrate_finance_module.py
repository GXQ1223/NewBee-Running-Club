#!/usr/bin/env python3
"""
One-time migration for the finance module (Books Grid).

1. Adds two-layer bookkeeping columns to donors:
       income_type VARCHAR(20) NULL   (donation | event_revenue | pass_through; NULL=unclassified)
       event_code  INTEGER NULL       (finance_categories 1xxx)
2. Creates the new tables (finance_categories, expenses, donor_directory)
   and seeds the category codes used in the club's Google Sheet.
3. Backfills income_type from the old two-state model:
       confirmed -> donation
       dismissed -> pass_through / event_revenue by memo keywords, else left unclassified
       pending   -> NULL (unclassified)

Safe to re-run. Works on SQLite (dev) and MySQL (prod):
    cd /var/www/newbeerunning/backend && python migrate_finance_module.py
"""

from sqlalchemy import inspect, text

from database import SessionLocal, FinanceCategory, create_tables, engine

DONOR_COLUMNS = [
    ("income_type", "VARCHAR(20) NULL"),
    ("event_code", "INTEGER NULL"),
]

CATEGORY_SEED = [
    # events (layer 1)
    ("event", 1001, "General"),
    ("event", 1002, "NewBee New Year Gala"),
    ("event", 1003, "NewBee Anniversary"),
    ("event", 1004, "Bear Mt. Run"),
    ("event", 1005, "BK Half Course Preview"),
    ("event", 1006, "Team Championship"),
    ("event", 1007, "Queens 10K"),
    # income types (layer 2, money in)
    ("income_type", 2001, "Donation"),
    ("income_type", 2002, "Gala Tickets"),
    ("income_type", 2003, "Merchandise Sales"),
    ("income_type", 2004, "Pass-through Agent"),
    # expense categories (layer 2, money out)
    ("expense", 5001, "Event Food & Drink"),
    ("expense", 5002, "Event Supplies"),
    ("expense", 5003, "Transportation"),
    ("expense", 5004, "Others (General)"),
    ("expense", 5005, "Space Rental"),
    ("expense", 5006, "Office Supplies&Sub"),
]

PASS_THROUGH_KEYWORDS = ["拼车", "carpool", "车费", "🚗"]
EVENT_REVENUE_KEYWORDS = ["队服", "衣服", "t-shirt", "tshirt", "t shirt", "tee",
                          "shirt", "jersey", "门票", "ticket"]


def migrate():
    # 1. donors columns
    inspector = inspect(engine)
    existing = {col["name"] for col in inspector.get_columns("donors")}
    with engine.begin() as conn:
        for name, ddl in DONOR_COLUMNS:
            if name in existing:
                print(f"Column donors.{name} already exists, skipping.")
                continue
            conn.execute(text(f"ALTER TABLE donors ADD COLUMN {name} {ddl}"))
            print(f"Added column donors.{name}.")

    # 2. new tables + category seed
    create_tables()
    db = SessionLocal()
    try:
        for kind, code, name in CATEGORY_SEED:
            exists = db.query(FinanceCategory).filter(
                FinanceCategory.kind == kind, FinanceCategory.code == code
            ).first()
            if not exists:
                db.add(FinanceCategory(kind=kind, code=code, name=name))
                print(f"Seeded {kind} {code} - {name}")
        db.commit()

        # 3. backfill income_type from the old status model
        rows = db.execute(text(
            "SELECT donation_id, status, message, notes FROM donors "
            "WHERE income_type IS NULL"
        )).fetchall()
        counts = {"donation": 0, "pass_through": 0, "event_revenue": 0, "unclassified": 0}
        for donation_id, status, message, notes in rows:
            memo = f"{message or ''} {notes or ''}".lower()
            income_type = None
            if status == "confirmed":
                income_type = "donation"
            elif status == "dismissed":
                if any(k in memo for k in PASS_THROUGH_KEYWORDS):
                    income_type = "pass_through"
                elif any(k in memo for k in EVENT_REVENUE_KEYWORDS):
                    income_type = "event_revenue"
                else:
                    counts["unclassified"] += 1  # left NULL for committee review
            if income_type:
                counts[income_type] += 1
                db.execute(text(
                    "UPDATE donors SET income_type = :t, "
                    "event_code = COALESCE(event_code, 1001) "
                    "WHERE donation_id = :id"
                ), {"t": income_type, "id": donation_id})
        # Earlier runs used a 'mistake' type — those rows belong in the
        # unclassified queue instead
        fixed = db.execute(text(
            "UPDATE donors SET income_type = NULL WHERE income_type = 'mistake'"
        ))
        if fixed.rowcount:
            counts["unclassified"] += fixed.rowcount
            print(f"Converted {fixed.rowcount} 'mistake' row(s) to unclassified.")
        db.commit()
        print(f"Backfilled income_type: {counts}")
    finally:
        db.close()

    print("Finance module migration complete.")


if __name__ == "__main__":
    migrate()
