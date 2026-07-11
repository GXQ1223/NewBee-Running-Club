"""Tests for scheduler.py — recurrence date math and background jobs.

The APScheduler instance is replaced with a MagicMock in start/shutdown tests
so no real scheduler or threads ever run. DB jobs run against the in-memory
test engine by monkeypatching scheduler.SessionLocal per-test.
"""
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock

import sys
import time as time_mod
import types

import pytest
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import sessionmaker

import scheduler as scheduler_mod
from scheduler import (
    calculate_next_occurrence,
    calculate_nth_weekday,
    create_event_instance,
    generate_recurring_events,
    run_recurring_job_now,
    run_transition_job_now,
    shutdown_scheduler,
    start_scheduler,
    transition_past_events,
)
from database import Event, EventRecurrenceRule

TODAY = date.today()
MONDAY = date(2026, 7, 6)  # a known Monday


def make_rule(**overrides):
    """Plain-attribute stand-in for EventRecurrenceRule in pure date math."""
    defaults = dict(
        recurrence_type='weekly', days_of_week=None, day_of_month=None,
        week_of_month=None, month_of_year=None, custom_rule=None,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


@pytest.fixture()
def job_db(db_session, monkeypatch):
    """Point the scheduler's own sessions at the test engine."""
    factory = sessionmaker(autocommit=False, autoflush=False, bind=db_session.get_bind())
    monkeypatch.setattr(scheduler_mod, 'SessionLocal', factory)
    return db_session


def add_event(db, name='Weekly Run', days_offset=-7, status='Upcoming', **overrides):
    ev = Event(
        name=name,
        chinese_name='每周跑',
        date=TODAY + timedelta(days=days_offset),
        time='8:00 AM',
        location='Central Park',
        chinese_location='中央公园',
        description='Easy run',
        chinese_description='轻松跑',
        image='run.jpg',
        signup_link='https://signup.test',
        status=status,
        event_type='standard',
        is_recurring=True,
        **overrides,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


def add_rule(db, event_id, **overrides):
    defaults = dict(recurrence_type='weekly', is_active=True, occurrences_created=0)
    defaults.update(overrides)
    rule = EventRecurrenceRule(event_id=event_id, **defaults)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def child_dates(db, parent_id):
    rows = db.query(Event).filter(Event.parent_event_id == parent_id).all()
    return sorted(e.date for e in rows)


# ---------------------------------------------------------------------------
# calculate_nth_weekday (frontend weekday convention: 0=Sunday .. 6=Saturday)
# ---------------------------------------------------------------------------

def test_nth_weekday_third_saturday_of_november():
    assert calculate_nth_weekday(2025, 11, 3, 6) == date(2025, 11, 15)


def test_nth_weekday_first_sunday():
    assert calculate_nth_weekday(2026, 6, 1, 0) == date(2026, 6, 7)


def test_nth_weekday_last_week_without_fifth_occurrence():
    # Last (week=5) Friday of Feb 2026 -> Feb 27 (only four Fridays)
    assert calculate_nth_weekday(2026, 2, 5, 5) == date(2026, 2, 27)


def test_nth_weekday_last_week_with_fifth_occurrence():
    # Last Sunday of March 2026 -> Mar 29 (five Sundays: 1, 8, 15, 22, 29)
    assert calculate_nth_weekday(2026, 3, 5, 0) == date(2026, 3, 29)


def test_nth_weekday_out_of_range_week_falls_back():
    # Defensive fallback: week beyond the month steps back a week and
    # still returns a date instead of raising.
    result = calculate_nth_weekday(2026, 7, 6, 6)
    assert isinstance(result, date)


# ---------------------------------------------------------------------------
# calculate_next_occurrence
# ---------------------------------------------------------------------------

def test_weekly_next_matching_day():
    assert MONDAY.weekday() == 0
    rule = make_rule(recurrence_type='weekly', days_of_week='2')  # Tuesday
    assert calculate_next_occurrence(rule, MONDAY) == date(2026, 7, 7)


def test_weekly_sunday_frontend_zero():
    rule = make_rule(recurrence_type='weekly', days_of_week='0')  # Sunday
    assert calculate_next_occurrence(rule, MONDAY) == date(2026, 7, 12)


def test_weekly_multiple_days_picks_soonest():
    rule = make_rule(recurrence_type='weekly', days_of_week='1,3')  # Mon, Wed
    # From Monday, the next of {Mon, Wed} is Wednesday
    assert calculate_next_occurrence(rule, MONDAY) == date(2026, 7, 8)


def test_weekly_without_days_adds_seven():
    rule = make_rule(recurrence_type='weekly')
    assert calculate_next_occurrence(rule, MONDAY) == MONDAY + timedelta(weeks=1)


def test_biweekly_adds_fourteen():
    rule = make_rule(recurrence_type='biweekly')
    assert calculate_next_occurrence(rule, MONDAY) == MONDAY + timedelta(weeks=2)


def test_monthly_day_of_month():
    rule = make_rule(recurrence_type='monthly', day_of_month=15)
    assert calculate_next_occurrence(rule, date(2026, 1, 10)) == date(2026, 2, 15)


def test_monthly_day_of_month_year_rollover():
    rule = make_rule(recurrence_type='monthly', day_of_month=15)
    assert calculate_next_occurrence(rule, date(2026, 12, 20)) == date(2027, 1, 15)


def test_monthly_day_31_clamped_to_short_month():
    rule = make_rule(recurrence_type='monthly', day_of_month=31)
    assert calculate_next_occurrence(rule, date(2026, 1, 31)) == date(2026, 2, 28)


def test_monthly_nth_weekday_uses_frontend_convention():
    # 3rd Saturday (frontend 6=Saturday). From Jan 2026 -> Feb 21 2026.
    # Before the fix this branch skipped the 0=Sunday conversion and
    # returned the 3rd Sunday (Feb 15) instead.
    rule = make_rule(recurrence_type='monthly', week_of_month=3, days_of_week='6')
    assert calculate_next_occurrence(rule, date(2026, 1, 10)) == date(2026, 2, 21)


def test_monthly_nth_weekday_year_rollover():
    rule = make_rule(recurrence_type='monthly', week_of_month=1, days_of_week='0')  # 1st Sunday
    assert calculate_next_occurrence(rule, date(2026, 12, 10)) == date(2027, 1, 3)


def test_monthly_nth_weekday_fifth_week_falls_back():
    # Week 5 overshoots Feb 2026 -> falls back one week to the last Saturday
    rule = make_rule(recurrence_type='monthly', week_of_month=5, days_of_week='6')
    assert calculate_next_occurrence(rule, date(2026, 1, 10)) == date(2026, 2, 28)


def test_monthly_without_pattern_adds_thirty_days():
    rule = make_rule(recurrence_type='monthly')
    assert calculate_next_occurrence(rule, MONDAY) == MONDAY + timedelta(days=30)


def test_yearly_nth_weekday_this_year():
    # 3rd Saturday of November, computed from January -> Nov 21 2026
    rule = make_rule(recurrence_type='yearly', month_of_year=11, week_of_month=3, days_of_week='6')
    assert calculate_next_occurrence(rule, date(2026, 1, 1)) == date(2026, 11, 21)


def test_yearly_nth_weekday_rolls_to_next_year_when_passed():
    rule = make_rule(recurrence_type='yearly', month_of_year=11, week_of_month=3, days_of_week='6')
    # On the occurrence date itself, the next one is next year's
    assert calculate_next_occurrence(rule, date(2026, 11, 21)) == date(2027, 11, 20)


def test_yearly_fallback_same_date_next_year():
    rule = make_rule(recurrence_type='yearly')
    assert calculate_next_occurrence(rule, date(2026, 3, 5)) == date(2027, 3, 5)


def test_yearly_fallback_handles_feb_29():
    rule = make_rule(recurrence_type='yearly')
    assert calculate_next_occurrence(rule, date(2028, 2, 29)) == date(2029, 2, 28)


def test_custom_interval_days():
    rule = make_rule(recurrence_type='custom', custom_rule='{"interval_days": 3}')
    assert calculate_next_occurrence(rule, MONDAY) == MONDAY + timedelta(days=3)


def test_custom_invalid_json_defaults_to_weekly():
    rule = make_rule(recurrence_type='custom', custom_rule='not-json')
    assert calculate_next_occurrence(rule, MONDAY) == MONDAY + timedelta(weeks=1)


def test_custom_missing_rule_defaults_to_weekly():
    rule = make_rule(recurrence_type='custom')
    assert calculate_next_occurrence(rule, MONDAY) == MONDAY + timedelta(weeks=1)


def test_unknown_type_defaults_to_weekly():
    rule = make_rule(recurrence_type='fortnightly-ish')
    assert calculate_next_occurrence(rule, MONDAY) == MONDAY + timedelta(weeks=1)


# ---------------------------------------------------------------------------
# create_event_instance
# ---------------------------------------------------------------------------

def test_create_event_instance_copies_parent_fields(db_session):
    parent = add_event(db_session)
    instance = create_event_instance(db_session, parent, TODAY + timedelta(days=7))
    db_session.commit()
    db_session.refresh(instance)

    assert instance.id != parent.id
    assert instance.parent_event_id == parent.id
    assert instance.date == TODAY + timedelta(days=7)
    assert instance.status == 'Upcoming'
    assert instance.is_recurring is False  # instance is not itself recurring
    for field in ('name', 'chinese_name', 'time', 'location', 'chinese_location',
                  'description', 'chinese_description', 'image', 'signup_link', 'event_type'):
        assert getattr(instance, field) == getattr(parent, field)


# ---------------------------------------------------------------------------
# generate_recurring_events
# ---------------------------------------------------------------------------

def test_generate_weekly_instances_within_lookahead(job_db):
    parent = add_event(job_db, days_offset=-7)
    rule = add_rule(job_db, parent.id)

    generate_recurring_events()

    job_db.expire_all()
    expected = [TODAY + timedelta(days=7 * i) for i in range(5)]  # today .. today+28
    assert child_dates(job_db, parent.id) == expected
    rule = job_db.query(EventRecurrenceRule).get(rule.id)
    assert rule.occurrences_created == 5
    assert rule.last_generated_date == TODAY + timedelta(days=28)


def test_generate_respects_max_occurrences(job_db):
    parent = add_event(job_db, days_offset=-7)
    add_rule(job_db, parent.id, max_occurrences=2)

    generate_recurring_events()

    job_db.expire_all()
    assert len(child_dates(job_db, parent.id)) == 2


def test_generate_skips_rule_already_at_max(job_db):
    parent = add_event(job_db, days_offset=-7)
    add_rule(job_db, parent.id, max_occurrences=3, occurrences_created=3)

    generate_recurring_events()

    job_db.expire_all()
    assert child_dates(job_db, parent.id) == []


def test_generate_skips_rule_past_end_date(job_db):
    parent = add_event(job_db, days_offset=-7)
    add_rule(job_db, parent.id, end_date=TODAY - timedelta(days=1))

    generate_recurring_events()

    job_db.expire_all()
    assert child_dates(job_db, parent.id) == []


def test_generate_stops_at_end_date_inside_window(job_db):
    parent = add_event(job_db, days_offset=-7)
    add_rule(job_db, parent.id, end_date=TODAY + timedelta(days=8))

    generate_recurring_events()

    job_db.expire_all()
    assert child_dates(job_db, parent.id) == [TODAY, TODAY + timedelta(days=7)]


def test_generate_skips_existing_instances(job_db):
    parent = add_event(job_db, days_offset=-7)
    # Pre-existing instance for the first occurrence date
    existing = Event(name=parent.name, date=TODAY, status='Upcoming',
                     parent_event_id=parent.id)
    job_db.add(existing)
    job_db.commit()
    rule = add_rule(job_db, parent.id)

    generate_recurring_events()

    job_db.expire_all()
    dates = child_dates(job_db, parent.id)
    assert dates == [TODAY + timedelta(days=7 * i) for i in range(5)]  # no duplicate
    assert len(dates) == len(set(dates))
    rule = job_db.query(EventRecurrenceRule).get(rule.id)
    assert rule.occurrences_created == 4  # only newly created ones counted


def test_generate_missing_parent_is_skipped(job_db):
    # SQLite does not enforce FKs by default, so a dangling event_id is possible
    rule = add_rule(job_db, event_id=999999)

    generate_recurring_events()  # must not raise

    job_db.expire_all()
    rule = job_db.query(EventRecurrenceRule).get(rule.id)
    assert rule.occurrences_created == 0


def test_generate_nothing_when_next_beyond_window(job_db):
    parent = add_event(job_db, days_offset=0)
    rule = add_rule(job_db, parent.id, recurrence_type='custom',
                    custom_rule='{"interval_days": 60}')

    generate_recurring_events()

    job_db.expire_all()
    assert child_dates(job_db, parent.id) == []
    rule = job_db.query(EventRecurrenceRule).get(rule.id)
    assert rule.occurrences_created == 0
    assert rule.last_generated_date is None


def test_generate_bad_rule_does_not_block_others(job_db):
    bad_parent = add_event(job_db, name='Bad')
    add_rule(job_db, bad_parent.id, days_of_week='not-a-number')  # int() raises
    good_parent = add_event(job_db, name='Good')
    add_rule(job_db, good_parent.id)

    generate_recurring_events()  # must not raise

    job_db.expire_all()
    assert child_dates(job_db, bad_parent.id) == []
    assert len(child_dates(job_db, good_parent.id)) > 0


def test_generate_ignores_inactive_rules(job_db):
    parent = add_event(job_db)
    add_rule(job_db, parent.id, is_active=False)

    generate_recurring_events()

    job_db.expire_all()
    assert child_dates(job_db, parent.id) == []


# ---------------------------------------------------------------------------
# transition_past_events
# ---------------------------------------------------------------------------

def test_transition_moves_only_past_upcoming(job_db):
    past_upcoming = add_event(job_db, name='Past Upcoming', days_offset=-3, status='Upcoming')
    future_upcoming = add_event(job_db, name='Future Upcoming', days_offset=3, status='Upcoming')
    already_past = add_event(job_db, name='Already Past', days_offset=-30, status='Past')
    cancelled = add_event(job_db, name='Cancelled', days_offset=-3, status='Cancelled')

    transition_past_events()

    job_db.expire_all()
    assert job_db.query(Event).get(past_upcoming.id).status == 'Past'
    assert job_db.query(Event).get(future_upcoming.id).status == 'Upcoming'
    assert job_db.query(Event).get(already_past.id).status == 'Past'
    assert job_db.query(Event).get(cancelled.id).status == 'Cancelled'


def test_transition_keeps_todays_event_upcoming(job_db):
    today_event = add_event(job_db, name='Today', days_offset=0, status='Upcoming')
    transition_past_events()
    job_db.expire_all()
    assert job_db.query(Event).get(today_event.id).status == 'Upcoming'


# ---------------------------------------------------------------------------
# start / shutdown / manual triggers (scheduler fully mocked — no threads)
# ---------------------------------------------------------------------------

def test_start_scheduler_registers_jobs_and_runs_transition(monkeypatch):
    fake = MagicMock()
    fake.running = False
    monkeypatch.setattr(scheduler_mod, 'scheduler', fake)
    transition_runs = []
    monkeypatch.setattr(scheduler_mod, 'transition_past_events',
                        lambda: transition_runs.append(True))

    start_scheduler()

    assert fake.add_job.call_count == 5
    (recurring_call, transition_call, nyrr_call, zelle_call, ack_call) = fake.add_job.call_args_list

    assert recurring_call.args[0] is scheduler_mod.generate_recurring_events
    assert recurring_call.kwargs['id'] == 'generate_recurring_events'
    assert recurring_call.kwargs['max_instances'] == 1
    assert isinstance(recurring_call.args[1], CronTrigger)
    assert "hour='2'" in str(recurring_call.args[1])

    assert transition_call.kwargs['id'] == 'transition_past_events'
    assert isinstance(transition_call.args[1], CronTrigger)
    assert "day_of_week='mon'" in str(transition_call.args[1])
    assert "hour='3'" in str(transition_call.args[1])

    assert nyrr_call.args[0] is scheduler_mod.sync_nyrr_results
    assert nyrr_call.kwargs['id'] == 'sync_nyrr_results'
    assert nyrr_call.kwargs['max_instances'] == 1
    assert isinstance(nyrr_call.args[1], CronTrigger)
    assert "day_of_week='mon'" in str(nyrr_call.args[1])
    assert "hour='4'" in str(nyrr_call.args[1])

    assert zelle_call.args[0] is scheduler_mod.sync_zelle_donations_job
    assert ack_call.args[0] is scheduler_mod.auto_ack_job
    assert ack_call.kwargs['id'] == 'auto_ack_donations'
    assert isinstance(ack_call.args[1], CronTrigger)
    assert "day_of_week='mon'" in str(ack_call.args[1])
    assert "hour='5'" in str(ack_call.args[1])
    assert zelle_call.kwargs['id'] == 'sync_zelle_donations'
    assert zelle_call.kwargs['max_instances'] == 1
    assert isinstance(zelle_call.args[1], CronTrigger)
    assert "day_of_week='mon'" in str(zelle_call.args[1])
    assert "hour='4'" in str(zelle_call.args[1])
    assert "minute='30'" in str(zelle_call.args[1])

    fake.start.assert_called_once()
    # Transition also runs once immediately on startup
    assert transition_runs == [True]


def test_start_scheduler_noop_when_already_running(monkeypatch):
    fake = MagicMock()
    fake.running = True
    monkeypatch.setattr(scheduler_mod, 'scheduler', fake)

    start_scheduler()

    fake.add_job.assert_not_called()
    fake.start.assert_not_called()


def test_shutdown_scheduler_stops_running_scheduler(monkeypatch):
    fake = MagicMock()
    fake.running = True
    monkeypatch.setattr(scheduler_mod, 'scheduler', fake)

    shutdown_scheduler()

    fake.shutdown.assert_called_once_with(wait=False)


def test_shutdown_scheduler_noop_when_not_running(monkeypatch):
    fake = MagicMock()
    fake.running = False
    monkeypatch.setattr(scheduler_mod, 'scheduler', fake)

    shutdown_scheduler()

    fake.shutdown.assert_not_called()


def test_run_recurring_job_now(monkeypatch):
    calls = []
    monkeypatch.setattr(scheduler_mod, 'generate_recurring_events', lambda: calls.append(True))
    run_recurring_job_now()
    assert calls == [True]


def test_run_transition_job_now(monkeypatch):
    calls = []
    monkeypatch.setattr(scheduler_mod, 'transition_past_events', lambda: calls.append(True))
    run_transition_job_now()
    assert calls == [True]


# ---------------------------------------------------------------------------
# weekly NYRR results sync job
# ---------------------------------------------------------------------------

def _fake_nyrr_module(fetch_impl, import_impl):
    mod = types.ModuleType('fetch_historical_data')
    mod.RACE_PATTERNS = {
        'BKH': {'name_template': 'Brooklyn Half {year}', 'distance': 'Half Marathon', 'typical_month': 5},
        'Q10K': {'name_template': 'Queens 10K {year}', 'distance': '10K', 'typical_month': 6},
    }
    mod.generate_event_code = lambda code, year: f'{code}-{year}'
    mod.generate_race_config = lambda code, info, year: {
        'name': info['name_template'].format(year=year), 'distance': info['distance'],
    }
    mod.fetch_race_data = fetch_impl
    mod.import_race_data = import_impl
    return mod


def test_sync_nyrr_results_imports_all_races(monkeypatch):
    imported = []
    mod = _fake_nyrr_module(
        fetch_impl=lambda ec: ['row1', 'row2'],
        import_impl=lambda ec, cfg, df: imported.append((ec, cfg['name'])) or len(df),
    )
    monkeypatch.setitem(sys.modules, 'fetch_historical_data', mod)
    monkeypatch.setattr(time_mod, 'sleep', lambda s: None)

    scheduler_mod.sync_nyrr_results()

    # Both previous and current year, all races (matches retired weekly_sync.sh)
    year = date.today().year
    assert imported == [
        (f'BKH-{year - 1}', f'Brooklyn Half {year - 1}'),
        (f'Q10K-{year - 1}', f'Queens 10K {year - 1}'),
        (f'BKH-{year}', f'Brooklyn Half {year}'),
        (f'Q10K-{year}', f'Queens 10K {year}'),
    ]


def test_sync_nyrr_results_skips_races_without_data(monkeypatch):
    imported = []
    mod = _fake_nyrr_module(
        fetch_impl=lambda ec: [] if ec.startswith('BKH') else None,
        import_impl=lambda ec, cfg, df: imported.append(ec) or 0,
    )
    monkeypatch.setitem(sys.modules, 'fetch_historical_data', mod)
    monkeypatch.setattr(time_mod, 'sleep', lambda s: None)

    scheduler_mod.sync_nyrr_results()

    assert imported == []  # empty df and None both skip import


def test_sync_nyrr_results_continues_after_race_error(monkeypatch):
    imported = []

    def fetch(ec):
        if ec.startswith('BKH'):
            raise RuntimeError('nyrr down')
        return ['row']

    mod = _fake_nyrr_module(fetch, lambda ec, cfg, df: imported.append(ec) or 1)
    monkeypatch.setitem(sys.modules, 'fetch_historical_data', mod)
    monkeypatch.setattr(time_mod, 'sleep', lambda s: None)

    scheduler_mod.sync_nyrr_results()

    year = date.today().year
    # BKH errored both years, Q10K still imported for both
    assert imported == [f'Q10K-{year - 1}', f'Q10K-{year}']


def test_sync_nyrr_results_counts_import_errors(monkeypatch):
    def bad_import(ec, cfg, df):
        raise RuntimeError('db write failed')

    mod = _fake_nyrr_module(lambda ec: ['row'], bad_import)
    monkeypatch.setitem(sys.modules, 'fetch_historical_data', mod)
    monkeypatch.setattr(time_mod, 'sleep', lambda s: None)

    # Should not raise despite every import failing
    scheduler_mod.sync_nyrr_results()


def test_sync_nyrr_results_handles_missing_module(monkeypatch):
    monkeypatch.setitem(sys.modules, 'fetch_historical_data', None)
    # Import failure logs and returns without raising
    scheduler_mod.sync_nyrr_results()


def test_run_nyrr_sync_now(monkeypatch):
    calls = []
    monkeypatch.setattr(scheduler_mod, 'sync_nyrr_results', lambda: calls.append(True))
    scheduler_mod.run_nyrr_sync_now()
    assert calls == [True]


# ---------------------------------------------------------------------------
# weekly Zelle donation sync job
# ---------------------------------------------------------------------------

def _fake_zelle_module(sync_impl):
    mod = types.ModuleType('sync_zelle_donations')
    mod.sync_zelle_donations = sync_impl
    return mod


def test_sync_zelle_donations_job_runs_with_pending_status(monkeypatch):
    calls = []

    def fake_sync(status):
        calls.append(status)
        return {'emails_found': 3, 'inserted': 2, 'duplicates': 1, 'errors': 0}

    monkeypatch.setitem(sys.modules, 'sync_zelle_donations', _fake_zelle_module(fake_sync))

    scheduler_mod.sync_zelle_donations_job()

    # New donations must land as pending for admin review
    assert calls == ['pending']


def test_sync_zelle_donations_job_logs_stats_without_raising(monkeypatch, caplog):
    stats = {'emails_found': 5, 'inserted': 4, 'duplicates': 1, 'errors': 0}
    mod = _fake_zelle_module(lambda status: stats)
    monkeypatch.setitem(sys.modules, 'sync_zelle_donations', mod)

    with caplog.at_level('INFO', logger='scheduler'):
        scheduler_mod.sync_zelle_donations_job()

    summary = [r.message for r in caplog.records if 'Donation sync complete' in r.message]
    assert len(summary) == 1
    assert '5 email(s) found' in summary[0]
    assert '4 new pending donation(s)' in summary[0]
    assert '1 duplicate(s)' in summary[0]
    assert '0 error(s)' in summary[0]


def test_sync_zelle_donations_job_handles_missing_module(monkeypatch, caplog):
    monkeypatch.setitem(sys.modules, 'sync_zelle_donations', None)

    with caplog.at_level('ERROR', logger='scheduler'):
        # Import failure logs and returns without raising
        scheduler_mod.sync_zelle_donations_job()

    assert any('failed to import sync_zelle_donations' in r.message for r in caplog.records)


def test_sync_zelle_donations_job_swallows_sync_errors(monkeypatch, caplog):
    def bad_sync(status):
        raise RuntimeError('imap down')

    monkeypatch.setitem(sys.modules, 'sync_zelle_donations', _fake_zelle_module(bad_sync))

    with caplog.at_level('ERROR', logger='scheduler'):
        # Exception is swallowed and logged, never propagated to the scheduler
        scheduler_mod.sync_zelle_donations_job()

    assert any('Donation sync failed: imap down' in r.message for r in caplog.records)


def test_run_donation_sync_now(monkeypatch):
    calls = []
    monkeypatch.setattr(scheduler_mod, 'sync_zelle_donations_job', lambda: calls.append(True))
    scheduler_mod.run_donation_sync_now()
    assert calls == [True]
