"""Tests for main.py — app wiring, CORS, startup seeding, migrations, lifespan.

The lifespan test stubs every startup/shutdown hook (no real scheduler, no
real DB) and _seed_settings_on_startup / _run_migrations run against
throwaway in-memory engines.
"""
import asyncio

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import database
import main
import routes.settings as settings_routes
from database import SiteSetting


@pytest.fixture()
def patched_session_local(db_session, monkeypatch):
    """Make database.SessionLocal produce sessions on the test engine."""
    factory = sessionmaker(autocommit=False, autoflush=False, bind=db_session.get_bind())
    monkeypatch.setattr(database, 'SessionLocal', factory)


# ---------------------------------------------------------------------------
# Root endpoint & app wiring
# ---------------------------------------------------------------------------

def test_root_health_check(client):
    resp = client.get('/')
    assert resp.status_code == 200
    body = resp.json()
    assert body['message'] == 'NewBee Running Club API is running!'
    assert body['version'] == '2.0.0'


def test_app_metadata():
    assert main.app.title == 'NewBee Running Club API'
    assert main.app.version == '2.0.0'


def test_all_domain_routers_registered():
    paths = {getattr(r, 'path', None) for r in main.app.routes}
    for expected in ('/api/donors', '/api/club-rules', '/api/events', '/api/settings'):
        assert any(p and p.startswith(expected) for p in paths), f'missing routes for {expected}'


# ---------------------------------------------------------------------------
# CORS middleware
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('origin', [
    'http://localhost:3000',
    'https://newbeerunningclub.org',
    'https://www.newbeerunningclub.org',
    'https://newbeerunning.org',
    'https://www.newbeerunning.org',
])
def test_cors_preflight_allows_known_origins(client, origin):
    resp = client.options('/', headers={
        'Origin': origin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'X-Firebase-UID',
    })
    assert resp.status_code == 200
    assert resp.headers['access-control-allow-origin'] == origin
    assert resp.headers['access-control-allow-credentials'] == 'true'
    assert 'X-Firebase-UID' in resp.headers['access-control-allow-headers']
    assert 'PATCH' in resp.headers['access-control-allow-methods']


def test_cors_preflight_rejects_unknown_origin(client):
    resp = client.options('/', headers={
        'Origin': 'https://evil.example.com',
        'Access-Control-Request-Method': 'GET',
    })
    assert resp.status_code == 400
    assert 'access-control-allow-origin' not in resp.headers


def test_cors_simple_request_gets_allow_origin_header(client):
    resp = client.get('/', headers={'Origin': 'http://localhost:3000'})
    assert resp.status_code == 200
    assert resp.headers['access-control-allow-origin'] == 'http://localhost:3000'


# ---------------------------------------------------------------------------
# _seed_settings_on_startup
# ---------------------------------------------------------------------------

def seeded_keys(db):
    return {s.key for s in db.query(SiteSetting).all()}


def test_seed_settings_on_startup(db_session, patched_session_local):
    main._seed_settings_on_startup()

    db_session.expire_all()
    keys = seeded_keys(db_session)
    assert 'donors_hide_amounts' in keys
    assert 'join_min_english_words' in keys
    assert 'join_min_chinese_chars' in keys
    assert 'social_instagram' in keys  # seed_social_links ran

    hide = db_session.query(SiteSetting).filter(SiteSetting.key == 'donors_hide_amounts').one()
    assert hide.value == 'false'
    assert hide.category == 'donors'
    assert hide.is_active is True
    words = db_session.query(SiteSetting).filter(SiteSetting.key == 'join_min_english_words').one()
    assert words.value == '120'
    chars = db_session.query(SiteSetting).filter(SiteSetting.key == 'join_min_chinese_chars').one()
    assert chars.value == '240'


def test_seed_settings_is_idempotent(db_session, patched_session_local):
    main._seed_settings_on_startup()
    db_session.expire_all()
    count_first = db_session.query(SiteSetting).count()

    main._seed_settings_on_startup()
    db_session.expire_all()
    assert db_session.query(SiteSetting).count() == count_first


def test_seed_settings_survives_errors(db_session, patched_session_local, monkeypatch, caplog):
    def boom(db):
        raise RuntimeError('seed exploded')

    monkeypatch.setattr(settings_routes, 'seed_social_links', boom)

    main._seed_settings_on_startup()  # must not raise

    db_session.expire_all()
    assert seeded_keys(db_session) == set()  # rolled back
    assert any('Error seeding settings' in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# _run_migrations (against a legacy-schema throwaway engine)
# ---------------------------------------------------------------------------

@pytest.fixture()
def legacy_engine(monkeypatch):
    """In-memory DB shaped like the pre-migration schema."""
    eng = create_engine(
        'sqlite://',
        connect_args={'check_same_thread': False},
        poolclass=StaticPool,
    )
    with eng.connect() as conn:
        conn.execute(text('CREATE TABLE members (id INTEGER PRIMARY KEY, username VARCHAR(100))'))
        conn.execute(text(
            'CREATE TABLE events (id INTEGER PRIMARY KEY, name VARCHAR(255), '
            'date DATE, status VARCHAR(50))'
        ))
        conn.execute(text(
            "INSERT INTO events (id, name, date, status) VALUES "
            "(1, 'Old Highlight',    '2020-01-01', 'Highlight'), "
            "(2, 'Future Highlight', '2030-01-01', 'Highlight'), "
            "(3, 'Buried Future',    '2030-01-01', 'Past'), "
            "(4, 'Normal Past',      '2020-01-01', 'Past'), "
            "(5, 'Stale Upcoming',   '2020-01-01', 'Upcoming')"
        ))
        # Pre-ledger donors table (no status/thank_you_sent_at/email_excerpt)
        conn.execute(text(
            'CREATE TABLE donors (donation_id INTEGER PRIMARY KEY, '
            'name VARCHAR(255), donor_type VARCHAR(20), amount DECIMAL(10,2))'
        ))
        conn.execute(text(
            "INSERT INTO donors (donation_id, name, donor_type, amount) "
            "VALUES (1, 'Legacy Donor', 'individual', 100)"
        ))
        conn.commit()
    monkeypatch.setattr(main, 'engine', eng)
    return eng


def event_rows(eng):
    with eng.connect() as conn:
        rows = conn.execute(text('SELECT id, status, is_highlight FROM events ORDER BY id')).fetchall()
    return {r[0]: (r[1], r[2]) for r in rows}


def test_run_migrations_adds_columns_and_backfills(legacy_engine):
    main._run_migrations()

    member_cols = [c['name'] for c in inspect(legacy_engine).get_columns('members')]
    assert 'nickname' in member_cols
    event_cols = [c['name'] for c in inspect(legacy_engine).get_columns('events')]
    assert 'is_highlight' in event_cols

    rows = event_rows(legacy_engine)
    assert rows[1] == ('Past', 1)       # past Highlight -> Past + featured
    assert rows[2] == ('Upcoming', 1)   # future Highlight -> Upcoming + featured
    assert rows[3] == ('Upcoming', 0)   # future event buried in Past is healed
    assert rows[4] == ('Past', 0)       # genuinely past stays Past
    assert rows[5] == ('Upcoming', 0)   # stale Upcoming untouched (weekly job's task)

    index_names = {ix['name'] for ix in inspect(legacy_engine).get_indexes('events')}
    assert 'idx_event_is_highlight' in index_names

    # Donation ledger columns added, legacy row defaulted to 'confirmed'
    donor_cols = [c['name'] for c in inspect(legacy_engine).get_columns('donors')]
    for col in ('status', 'thank_you_sent_at', 'email_excerpt'):
        assert col in donor_cols
    with legacy_engine.connect() as conn:
        row = conn.execute(text('SELECT status FROM donors WHERE donation_id = 1')).fetchone()
    assert row[0] == 'confirmed'


def test_run_migrations_is_idempotent(legacy_engine):
    main._run_migrations()
    first = event_rows(legacy_engine)

    main._run_migrations()  # columns exist now; ALTER branches skipped

    assert event_rows(legacy_engine) == first
    member_cols = [c['name'] for c in inspect(legacy_engine).get_columns('members')]
    assert member_cols.count('nickname') == 1
    donor_cols = [c['name'] for c in inspect(legacy_engine).get_columns('donors')]
    assert donor_cols.count('status') == 1


# ---------------------------------------------------------------------------
# Lifespan handler
# ---------------------------------------------------------------------------

def test_lifespan_runs_startup_and_shutdown_hooks(monkeypatch):
    calls = []
    monkeypatch.setattr(main, 'create_tables', lambda: calls.append('create_tables'))
    monkeypatch.setattr(main, '_run_migrations', lambda: calls.append('migrations'))
    monkeypatch.setattr(main, 'start_scheduler', lambda: calls.append('start_scheduler'))
    monkeypatch.setattr(main, '_seed_settings_on_startup', lambda: calls.append('seed'))
    monkeypatch.setattr(main, 'shutdown_scheduler', lambda: calls.append('shutdown_scheduler'))

    async def run():
        async with main.lifespan(main.app):
            calls.append('running')

    asyncio.run(run())

    assert calls == [
        'create_tables',
        'migrations',
        'start_scheduler',
        'seed',
        'running',
        'shutdown_scheduler',
    ]
