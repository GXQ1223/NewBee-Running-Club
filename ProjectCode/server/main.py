"""
NewBee Running Club API - Main application entry point.

This is the slim entry point that creates the FastAPI app, configures middleware,
runs startup tasks, and includes all route modules.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect
import os

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from database import create_tables, SiteSetting, engine
from scheduler import start_scheduler, shutdown_scheduler

# Import all route modules
from routes import (
    results,
    donors,
    members,
    activities,
    events,
    meeting_minutes,
    club_rules,
    engagement,
    credits,
    banners,
    homepage,
    uploads,
    training_tips,
    gallery,
    recurrence,
    highlights,
    settings,
)


def _seed_settings_on_startup():
    """Seed default site settings on startup."""
    from database import SessionLocal
    from routes.settings import seed_social_links
    db = SessionLocal()
    try:
        seed_social_links(db)
        # Seed donors_hide_amounts setting
        existing = db.query(SiteSetting).filter(SiteSetting.key == "donors_hide_amounts").first()
        if not existing:
            db.add(SiteSetting(
                key="donors_hide_amounts",
                value="false",
                label_en="Hide Donation Amounts",
                label_cn="隐藏捐款金额",
                category="donors",
                is_active=True
            ))
            db.commit()

        # Seed join requirements settings
        for setting_data in [
            {"key": "join_min_english_words", "value": "120", "label_en": "Min English Words", "label_cn": "最少英文单词数", "category": "join"},
            {"key": "join_min_chinese_chars", "value": "240", "label_en": "Min Chinese Characters", "label_cn": "最少中文字符数", "category": "join"},
        ]:
            if not db.query(SiteSetting).filter(SiteSetting.key == setting_data["key"]).first():
                db.add(SiteSetting(**setting_data, is_active=True))
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logging.getLogger(__name__).error(f"Error seeding settings: {e}")
    finally:
        db.close()


def _run_migrations():
    """Run lightweight schema migrations for new columns."""
    inspector = inspect(engine)
    member_columns = [c['name'] for c in inspector.get_columns('members')]
    if 'nickname' not in member_columns:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE members ADD COLUMN nickname VARCHAR(100)"))
            conn.commit()

    # Split highlight curation flag out of the lifecycle status column.
    # Legacy: status='Highlight' meant both "this is a past event" and "feature it".
    # New: status in ('Upcoming','Past','Cancelled'); is_highlight is a separate flag.
    event_columns = [c['name'] for c in inspector.get_columns('events')]
    dialect = engine.dialect.name
    today_fn = "CURRENT_DATE" if dialect == 'sqlite' else "CURDATE()"
    if 'is_highlight' not in event_columns:
        with engine.connect() as conn:
            if dialect == 'sqlite':
                conn.execute(text(
                    "ALTER TABLE events ADD COLUMN is_highlight BOOLEAN NOT NULL DEFAULT 0"
                ))
            else:
                conn.execute(text(
                    "ALTER TABLE events ADD COLUMN is_highlight TINYINT(1) NOT NULL DEFAULT 0"
                ))
            # Backfill: every existing 'Highlight' event becomes featured. Lifecycle
            # is decided by date so we don't bury a future highlight in 'Past'.
            conn.execute(text(
                f"UPDATE events SET is_highlight = 1, "
                f"status = CASE WHEN date < {today_fn} THEN 'Past' ELSE 'Upcoming' END "
                f"WHERE status = 'Highlight'"
            ))
            try:
                conn.execute(text(
                    "CREATE INDEX idx_event_is_highlight ON events (is_highlight)"
                ))
            except Exception:
                pass  # Index may already exist (e.g., from create_tables on fresh DB)
            conn.commit()

    # Heal any rows that were buried in 'Past' before the migration became
    # date-aware (e.g. the first 'is_highlight' deploy on 2026-05-16). A future
    # date in Past means the row is invisible on both Upcoming and Memories.
    # is_highlight is left intact.
    with engine.connect() as conn:
        conn.execute(text(
            f"UPDATE events SET status = 'Upcoming' "
            f"WHERE status = 'Past' AND date >= {today_fn}"
        ))
        conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup and shutdown events."""
    # Startup
    create_tables()
    _run_migrations()
    start_scheduler()
    _seed_settings_on_startup()
    yield
    # Shutdown
    shutdown_scheduler()


app = FastAPI(
    title="NewBee Running Club API",
    description="API for NewBee Running Club - member management, events, race results, and more",
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware for frontend connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://newbeerunningclub.org",
        "https://www.newbeerunningclub.org",
        "https://newbeerunning.org",
        "https://www.newbeerunning.org",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "X-Firebase-UID"],
)


# Root health check
@app.get("/")
def read_root():
    return {"message": "NewBee Running Club API is running!", "version": "2.0.0"}


# Register all route modules
app.include_router(results.router)
app.include_router(donors.router)
app.include_router(members.router)
app.include_router(activities.router)
app.include_router(events.router)
app.include_router(meeting_minutes.router)
app.include_router(club_rules.router)
app.include_router(engagement.router)
app.include_router(credits.router)
app.include_router(banners.router)
app.include_router(homepage.router)
app.include_router(uploads.router)
app.include_router(training_tips.router)
app.include_router(gallery.router)
app.include_router(recurrence.router)
app.include_router(highlights.router)
app.include_router(settings.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("API_HOST", "0.0.0.0"),
        port=int(os.getenv("API_PORT", 8000)),
        reload=os.getenv("DEBUG", "False").lower() == "true"
    )
