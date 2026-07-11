"""
Event Scheduler

This module handles scheduled background jobs using APScheduler:
1. Daily (2 AM): Generate recurring event instances from active recurrence rules
2. Weekly (Monday 3 AM): Transition past Upcoming events to Past (Memories)

The past events transition also runs once on startup to catch any stale events.
"""

import os
import logging
import calendar
from datetime import date, timedelta
import json
from contextlib import contextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from database import SessionLocal, Event, EventRecurrenceRule
from utils.recurrence import create_event_instance

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Scheduler instance
scheduler = BackgroundScheduler()


@contextmanager
def get_db_session():
    """Context manager for database sessions"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def calculate_nth_weekday(year: int, month: int, week: int, weekday: int) -> date:
    """
    Calculate the nth weekday of a month (e.g., 3rd Saturday of November).

    Args:
        year: The year
        month: The month (1-12)
        week: The week number (1-4 for 1st-4th, 5 for last)
        weekday: The day of week (0=Monday, 6=Sunday in Python's weekday())
                 Note: Input expects 0=Sunday, 6=Saturday format from frontend

    Returns:
        date: The calculated date
    """
    # Convert frontend weekday format (0=Sunday) to Python weekday (0=Monday)
    python_weekday = (weekday - 1) % 7 if weekday > 0 else 6

    first_of_month = date(year, month, 1)
    first_weekday = first_of_month.weekday()

    # Calculate days until target weekday
    days_until_weekday = (python_weekday - first_weekday) % 7
    first_occurrence = first_of_month + timedelta(days=days_until_weekday)

    if week == 5:  # "Last" week
        # Find last occurrence by starting from 4th and checking if 5th exists
        result = first_occurrence + timedelta(weeks=4)
        if result.month != month:
            result -= timedelta(weeks=1)
        return result

    # Calculate the nth occurrence
    result = first_occurrence + timedelta(weeks=week - 1)

    # Validate it's still in the target month
    if result.month == month:
        return result
    else:
        # Fall back to previous week if we went past the month
        return result - timedelta(weeks=1)


def calculate_next_occurrence(rule: EventRecurrenceRule, base_date: date) -> date:
    """
    Calculate the next occurrence date based on recurrence rule.

    Args:
        rule: EventRecurrenceRule object with recurrence settings
        base_date: The date to calculate from

    Returns:
        date: The next occurrence date
    """
    current_date = base_date

    if rule.recurrence_type == 'weekly':
        # Weekly: add 7 days
        if rule.days_of_week:
            # Convert frontend weekday format (0=Sunday) to Python weekday (0=Monday)
            frontend_days = [int(d) for d in rule.days_of_week.split(',')]
            python_days = [(d - 1) % 7 if d > 0 else 6 for d in frontend_days]
            for i in range(1, 8):
                next_date = current_date + timedelta(days=i)
                if next_date.weekday() in python_days:
                    return next_date
        return current_date + timedelta(weeks=1)

    elif rule.recurrence_type == 'biweekly':
        # Biweekly: add 14 days
        return current_date + timedelta(weeks=2)

    elif rule.recurrence_type == 'monthly':
        # Monthly: same day next month
        if rule.day_of_month:
            month = current_date.month + 1
            year = current_date.year
            if month > 12:
                month = 1
                year += 1
            # Handle months with fewer days
            max_day = calendar.monthrange(year, month)[1]
            day = min(rule.day_of_month, max_day)
            return date(year, month, day)
        elif rule.week_of_month and rule.days_of_week:
            # nth weekday of month (e.g., 3rd Saturday)
            # Convert frontend weekday format (0=Sunday) to Python weekday (0=Monday)
            frontend_weekday = int(rule.days_of_week.split(',')[0])
            target_weekday = (frontend_weekday - 1) % 7 if frontend_weekday > 0 else 6
            target_week = rule.week_of_month

            month = current_date.month + 1
            year = current_date.year
            if month > 12:
                month = 1
                year += 1

            # Find the nth weekday of the month
            first_of_month = date(year, month, 1)
            first_weekday = first_of_month.weekday()

            # Calculate the first occurrence of target weekday
            days_until_weekday = (target_weekday - first_weekday) % 7
            first_occurrence = first_of_month + timedelta(days=days_until_weekday)

            # Add weeks to get to the target week
            result = first_occurrence + timedelta(weeks=target_week - 1)

            # Validate it's still in the target month
            if result.month == month:
                return result
            else:
                # Fall back to last occurrence of that weekday
                return result - timedelta(weeks=1)
        else:
            return current_date + timedelta(days=30)

    elif rule.recurrence_type == 'yearly':
        # Check if using week-of-month pattern (e.g., "3rd Saturday of November")
        if rule.month_of_year and rule.week_of_month and rule.days_of_week:
            target_month = rule.month_of_year
            target_week = rule.week_of_month
            target_weekday = int(rule.days_of_week.split(',')[0])

            # Determine target year
            year = current_date.year

            # Calculate this year's occurrence
            this_year_date = calculate_nth_weekday(year, target_month, target_week, target_weekday)

            # If we've passed this year's occurrence, use next year
            if this_year_date <= current_date:
                year += 1

            return calculate_nth_weekday(year, target_month, target_week, target_weekday)
        else:
            # Fallback: same date next year
            try:
                return date(current_date.year + 1, current_date.month, current_date.day)
            except ValueError:
                # Handle Feb 29 on non-leap years
                return date(current_date.year + 1, current_date.month, 28)

    elif rule.recurrence_type == 'custom':
        # Custom: parse JSON rule
        if rule.custom_rule:
            try:
                custom = json.loads(rule.custom_rule)
                interval_days = custom.get('interval_days', 7)
                return current_date + timedelta(days=interval_days)
            except (json.JSONDecodeError, TypeError):
                pass
        return current_date + timedelta(weeks=1)

    # Default fallback
    return current_date + timedelta(weeks=1)


def generate_recurring_events():
    """
    Daily job to create upcoming recurring event instances.

    This function:
    1. Queries all active recurrence rules
    2. For each rule, checks if new instances need to be generated
    3. Creates event instances up to 30 days in advance
    4. Updates the rule's tracking fields
    """
    logger.info("Starting recurring events generation job...")

    today = date.today()
    look_ahead_days = 30  # Generate events up to 30 days in advance
    look_ahead_date = today + timedelta(days=look_ahead_days)

    with get_db_session() as db:
        # Get all active recurrence rules
        rules = db.query(EventRecurrenceRule).filter(
            EventRecurrenceRule.is_active == True
        ).all()

        total_generated = 0

        for rule in rules:
            try:
                # Get the parent event
                parent_event = db.query(Event).filter(Event.id == rule.event_id).first()
                if not parent_event:
                    logger.warning(f"Parent event {rule.event_id} not found for rule {rule.id}")
                    continue

                # Check if rule has reached max occurrences
                if rule.max_occurrences and rule.occurrences_created >= rule.max_occurrences:
                    logger.info(f"Rule {rule.id} reached max occurrences, skipping")
                    continue

                # Check if past end date
                if rule.end_date and today > rule.end_date:
                    logger.info(f"Rule {rule.id} past end date, skipping")
                    continue

                # Determine the base date for calculating next occurrence
                base_date = rule.last_generated_date or parent_event.date

                # Generate instances up to look_ahead_date
                generated_count = 0
                current_date = base_date

                while True:
                    next_date = calculate_next_occurrence(rule, current_date)

                    # Stop if next occurrence is beyond look-ahead window
                    if next_date > look_ahead_date:
                        break

                    # Stop if past end date
                    if rule.end_date and next_date > rule.end_date:
                        break

                    # Stop if max occurrences reached
                    if rule.max_occurrences:
                        if rule.occurrences_created + generated_count >= rule.max_occurrences:
                            break

                    # Check if this date already has an instance
                    existing = db.query(Event).filter(
                        Event.parent_event_id == parent_event.id,
                        Event.date == next_date
                    ).first()

                    if not existing:
                        # Create new instance
                        new_event = create_event_instance(db, parent_event, next_date)
                        generated_count += 1
                        logger.info(f"Created event instance for {parent_event.name} on {next_date}")

                    current_date = next_date

                # Update rule tracking
                if generated_count > 0:
                    rule.last_generated_date = current_date
                    rule.occurrences_created += generated_count
                    total_generated += generated_count

            except Exception as e:
                logger.error(f"Error processing rule {rule.id}: {str(e)}")
                continue

        # Commit all changes
        db.commit()
        logger.info(f"Recurring events generation complete. Created {total_generated} instances.")


def transition_past_events():
    """
    Weekly job to transition past Upcoming events to Past (Memories).

    Scans all events with status='Upcoming' and moves any with a past date
    to 'Past' so they appear on the Memories page instead of Upcoming.
    Highlight curation is independent of this lifecycle change.
    """
    logger.info("Starting past events transition job...")
    today = date.today()

    with get_db_session() as db:
        past_upcoming = db.query(Event).filter(
            Event.status == 'Upcoming',
            Event.date < today
        ).all()

        count = len(past_upcoming)
        for event in past_upcoming:
            logger.info(
                f"Transitioning event '{event.name}' (date: {event.date}) "
                f"from Upcoming to Past"
            )
            event.status = 'Past'

        db.commit()
        logger.info(f"Past events transition complete. Transitioned {count} event(s).")


def sync_nyrr_results():
    """
    Weekly job to sync NYRR race results for the current year.

    Runs the same fetch/import pipeline as the admin "Sync NYRR Data"
    button (routes/results.py /sync) across all known race patterns.
    Scheduled after each weekend so Saturday/Sunday race results land
    automatically. Unknown/renamed event codes yield no data and are
    logged rather than raising.
    """
    import time as _time

    logger.info("Starting weekly NYRR results sync job...")
    try:
        from fetch_historical_data import (
            RACE_PATTERNS, generate_event_code, generate_race_config,
            fetch_race_data, import_race_data,
        )
    except Exception as e:
        logger.error(f"NYRR sync: failed to import fetch_historical_data: {e}")
        return

    # Current + previous year, matching the retired weekly_sync.sh: prior-year
    # results get late corrections, and in January the current year is empty.
    current_year = date.today().year
    years = [current_year - 1, current_year]
    total_imported = 0
    total_errors = 0

    for year in years:
        for code, info in RACE_PATTERNS.items():
            event_code = generate_event_code(code, year)
            config = generate_race_config(code, info, year)
            race_name = config["name"]
            try:
                df = fetch_race_data(event_code)
                if df is not None and len(df) > 0:
                    count = import_race_data(event_code, config, df)
                    total_imported += count
                    logger.info(f"NYRR sync: {race_name} ({event_code}): imported {count} results")
                else:
                    logger.info(f"NYRR sync: {race_name} ({event_code}): no data")
            except Exception as e:
                total_errors += 1
                logger.error(f"NYRR sync: {race_name} ({event_code}): {e}")
            # Be polite to the NYRR API between races
            _time.sleep(0.5)

    logger.info(
        f"NYRR results sync complete: {total_imported} results imported, "
        f"{total_errors} error(s)."
    )


def start_scheduler():
    """
    Start the APScheduler with configured jobs.
    """
    # Only start if not already running
    if scheduler.running:
        logger.info("Scheduler already running")
        return

    # Add the recurring events job - runs daily at 2 AM
    scheduler.add_job(
        generate_recurring_events,
        CronTrigger(hour=2, minute=0),
        id='generate_recurring_events',
        replace_existing=True,
        max_instances=1
    )

    # Add weekly job to transition past Upcoming events to Highlight (Memories)
    # Runs every Monday at 3 AM
    scheduler.add_job(
        transition_past_events,
        CronTrigger(day_of_week='mon', hour=3, minute=0),
        id='transition_past_events',
        replace_existing=True,
        max_instances=1
    )

    # Weekly NYRR results sync — Monday 4 AM UTC (Sunday night in New York),
    # right after each race weekend. Replaces the old weekly_sync.sh crontab.
    scheduler.add_job(
        sync_nyrr_results,
        CronTrigger(day_of_week='mon', hour=4, minute=0),
        id='sync_nyrr_results',
        replace_existing=True,
        max_instances=1
    )

    # Start the scheduler
    scheduler.start()
    logger.info(
        "Scheduler started - recurring events job (daily 2 AM), past events "
        "transition (weekly Mon 3 AM), NYRR results sync (weekly Mon 4 AM UTC)"
    )

    # Run transition immediately on startup to catch any stale events
    transition_past_events()


def shutdown_scheduler():
    """
    Gracefully shutdown the scheduler.
    """
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler shutdown complete")


def run_recurring_job_now():
    """
    Manually trigger the recurring events generation job.
    Useful for testing or administrative purposes.
    """
    logger.info("Manually triggering recurring events generation...")
    generate_recurring_events()


def run_transition_job_now():
    """
    Manually trigger the past events transition job.
    Useful for testing or administrative purposes.
    """
    logger.info("Manually triggering past events transition...")
    transition_past_events()


def run_nyrr_sync_now():
    """
    Manually trigger the weekly NYRR results sync job.
    Useful for testing or administrative purposes.
    """
    logger.info("Manually triggering NYRR results sync...")
    sync_nyrr_results()


if __name__ == "__main__":
    # For testing the scheduler independently
    print("Running recurring events generation manually...")
    run_recurring_job_now()
    print("Running past events transition manually...")
    run_transition_job_now()
    print("Done!")
