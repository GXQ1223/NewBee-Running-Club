"""
Migration script to add group_name columns to the events table.
Run this script to update the database schema.

Usage:
    python migrations/add_group_name_columns.py
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import engine, USE_SQLITE

def migrate():
    """Add group_name and group_name_cn columns to events table."""

    with engine.connect() as conn:
        # Check if columns already exist
        if USE_SQLITE:
            result = conn.execute(text("PRAGMA table_info(events)"))
            columns = [row[1] for row in result.fetchall()]
        else:
            result = conn.execute(text("""
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'events' AND COLUMN_NAME IN ('group_name', 'group_name_cn')
            """))
            columns = [row[0] for row in result.fetchall()]

        # Add group_name column if not exists
        if 'group_name' not in columns:
            print("Adding group_name column...")
            if USE_SQLITE:
                conn.execute(text("ALTER TABLE events ADD COLUMN group_name VARCHAR(255)"))
            else:
                conn.execute(text("ALTER TABLE events ADD COLUMN group_name VARCHAR(255)"))
            conn.commit()
            print("  Added group_name column")
        else:
            print("  group_name column already exists")

        # Add group_name_cn column if not exists
        if 'group_name_cn' not in columns:
            print("Adding group_name_cn column...")
            if USE_SQLITE:
                conn.execute(text("ALTER TABLE events ADD COLUMN group_name_cn VARCHAR(255)"))
            else:
                conn.execute(text("ALTER TABLE events ADD COLUMN group_name_cn VARCHAR(255)"))
            conn.commit()
            print("  Added group_name_cn column")
        else:
            print("  group_name_cn column already exists")

        # Add index for group_name (MySQL syntax differs from SQLite)
        print("Adding index for group_name...")
        try:
            if USE_SQLITE:
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_event_group_name ON events (group_name)"))
            else:
                # Check if index exists first
                result = conn.execute(text("""
                    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                    WHERE TABLE_NAME = 'events' AND INDEX_NAME = 'idx_event_group_name'
                """))
                if result.fetchone()[0] == 0:
                    conn.execute(text("CREATE INDEX idx_event_group_name ON events (group_name)"))
            conn.commit()
            print("  Added index for group_name")
        except Exception as e:
            print(f"  Index may already exist: {e}")

    print("\nMigration completed successfully!")


if __name__ == "__main__":
    migrate()
