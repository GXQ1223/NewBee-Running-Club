"""Tests for routes/heylo_sync.py (Heylo activity -> website event sync)."""
from datetime import date, timedelta

from database import Event
from tests.conftest import auth


def _item(**overrides):
    item = {
        'name': 'Wednesday Night Run',
        'date': (date.today() + timedelta(days=3)).isoformat(),
        'time': '6:30 PM',
        'location': 'Central Park',
        'description': 'Easy miles with the crew.',
        'signup_link': 'https://www.heylo.com/events/wed-night-run',
    }
    item.update(overrides)
    return item


def _sync(client, member, activities):
    return client.post(
        '/api/heylo/sync', json={'activities': activities}, headers=auth(member),
    )


# ---------- auth ----------

def test_sync_requires_auth(client):
    resp = client.post('/api/heylo/sync', json={'activities': [_item()]})
    assert resp.status_code == 401


def test_sync_forbidden_for_regular_member(client, regular_member):
    resp = _sync(client, regular_member, [_item()])
    assert resp.status_code == 403


def test_sync_allows_committee(client, committee_member):
    resp = _sync(client, committee_member, [_item()])
    assert resp.status_code == 200
    assert resp.json()['created'] == 1


# ---------- create / dedup / update ----------

def test_sync_creates_heylo_events(client, db_session, admin_member):
    other = _item(name='Saturday Long Run', signup_link='https://www.heylo.com/events/sat-long')
    body = _sync(client, admin_member, [_item(), other]).json()
    assert body['created'] == 2
    assert body['updated'] == 0
    assert body['unchanged'] == 0

    events = db_session.query(Event).all()
    assert len(events) == 2
    assert all(e.event_type == 'heylo' for e in events)
    assert {r['action'] for r in body['results']} == {'created'}


def test_sync_is_idempotent(client, db_session, admin_member):
    _sync(client, admin_member, [_item()])
    body = _sync(client, admin_member, [_item()]).json()
    assert body['created'] == 0
    assert body['updated'] == 0
    assert body['unchanged'] == 1
    assert db_session.query(Event).count() == 1


def test_sync_updates_changed_fields(client, db_session, admin_member):
    _sync(client, admin_member, [_item()])
    body = _sync(client, admin_member, [_item(location='Prospect Park')]).json()
    assert body['updated'] == 1
    event = db_session.query(Event).one()
    assert event.location == 'Prospect Park'


def test_sync_null_fields_do_not_wipe_existing_values(client, db_session, admin_member):
    _sync(client, admin_member, [_item(image='https://example.com/run.jpg')])
    # Re-sync the same Heylo event without an image: the stored one survives.
    body = _sync(client, admin_member, [_item()]).json()
    assert body['unchanged'] == 1
    assert db_session.query(Event).one().image == 'https://example.com/run.jpg'


def test_sync_dedup_ignores_standard_events_with_same_link(client, db_session, admin_member):
    """A standard event that happens to share the URL must not be hijacked."""
    from tests.helpers_events import make_event
    make_event(db_session, name='Manual Event', signup_link=_item()['signup_link'])
    body = _sync(client, admin_member, [_item()]).json()
    assert body['created'] == 1
    assert db_session.query(Event).count() == 2


# ---------- status handling ----------

def test_sync_derives_status_from_date(client, db_session, admin_member):
    past = _item(
        name='Last Week Run',
        date=(date.today() - timedelta(days=7)).isoformat(),
        signup_link='https://www.heylo.com/events/last-week',
    )
    _sync(client, admin_member, [past, _item()])
    by_name = {e.name: e.status for e in db_session.query(Event).all()}
    assert by_name['Last Week Run'] == 'Past'
    assert by_name['Wednesday Night Run'] == 'Upcoming'


def test_sync_explicit_status_wins(client, db_session, admin_member):
    _sync(client, admin_member, [_item(status='Cancelled')])
    assert db_session.query(Event).one().status == 'Cancelled'


def test_sync_rejects_empty_batch(client, admin_member):
    resp = client.post(
        '/api/heylo/sync', json={'activities': []}, headers=auth(admin_member),
    )
    assert resp.status_code == 422


# ---------- GET /synced ----------

def test_get_synced_empty(client):
    resp = client.get('/api/heylo/synced')
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_synced_lists_only_heylo_events(client, db_session, admin_member):
    from tests.helpers_events import make_event
    make_event(db_session, name='Manual Event')
    _sync(client, admin_member, [_item()])
    body = client.get('/api/heylo/synced').json()
    assert [e['name'] for e in body] == ['Wednesday Night Run']
    assert body[0]['signup_link'] == 'https://www.heylo.com/events/wed-night-run'
