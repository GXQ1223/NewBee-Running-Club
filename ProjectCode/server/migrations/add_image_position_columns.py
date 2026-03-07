"""
Migration script to add image_position columns to banner_images and homepage_sections tables.
Run this script to update the database schema.

Usage:
    python migrations/add_image_position_columns.py
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import engine, USE_SQLITE


def get_columns(conn, table_name):
    """Get existing column names for a table."""
    if USE_SQLITE:
        result = conn.execute(text(f"PRAGMA table_info({table_name})"))
        return [row[1] for row in result.fetchall()]
    else:
        result = conn.execute(text(f"""
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = '{table_name}'
        """))
        return [row[0] for row in result.fetchall()]


def add_column(conn, table_name, column_name, column_type, default=None):
    """Add a column to a table if it doesn't exist."""
    columns = get_columns(conn, table_name)
    if column_name not in columns:
        print(f"Adding {column_name} column to {table_name}...")
        default_clause = f" DEFAULT '{default}'" if default else ""
        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}{default_clause}"))
        conn.commit()
        print(f"  Added {column_name} column")
    else:
        print(f"  {column_name} column already exists in {table_name}")


def migrate():
    """Add image_position columns to banner_images and homepage_sections tables."""

    with engine.connect() as conn:
        add_column(conn, 'banner_images', 'image_position', 'VARCHAR(50)', 'center center')
        add_column(conn, 'homepage_sections', 'image_position', 'VARCHAR(50)', 'center center')

    print("\nMigration completed successfully!")


if __name__ == "__main__":
    migrate()
