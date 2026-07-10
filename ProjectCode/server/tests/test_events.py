"""Tests for routes/events.py (event CRUD + legacy Highlight status handling)."""
from datetime import date, timedelta

from database import (
    Comment, Event, EventCommentSettings, EventGalleryImage,
    EventRecurrenceRule, Like, Reaction,
)
from tests.conftest import auth
from tests.helpers_events import make_event


PAYLOAD = {
    'name': 'Sunday Long Run',
    'chinese_name': '周日长跑',
    'date': '2025-06-01',
    'time': '8:00 AM',
    'location': 'Central Park',
    'status': 'Upcoming',
    'event_type': 'standard',
}


# ---------- GET list ----------

def test_get_all_events_empty(client):
    resp = client.get('/api/events')
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_all_events_ordered_by_date_desc(client, db_session):
    make_event(db_session, name='Older', event_date=date(2025, 1, 1))
    make_event(db_session, name='Newer', event_date=date(2025, 3, 1))
    body = client.get('/api/events').json()
    assert [e['name'] for e in body] == ['Newer', 'Older']


def test_get_all_events_filter_by_status(client, db_session):
    make_event(db_session, name='Up', status='Upcoming')
    make_event(db_session, name='Done', status='Past')
    body = client.get('/api/events', params={'event_status': 'Past'}).json()
    assert [e['name'] for e in body] == ['Done']


def test_get_all_events_legacy_highlight_filter(client, db_session):
    make_event(db_session, name='Featured', status='Past', is_highlight=True)
    make_event(db_session, name='Plain Past', status='Past', is_highlight=False)
    make_event(db_session, name='Upcoming Featured', status='Upcoming', is_highlight=True)
    body = client.get('/api/events', params={'event_status': 'Highlight'}).json()
    assert [e['name'] for e in body] == ['Featured']


def test_get_events_by_status_path(client, db_session):
    make_event(db_session, name='Cxl', status='Cancelled')
    make_event(db_session, name='Up', status='Upcoming')
    body = client.get('/api/events/status/Cancelled').json()
    assert [e['name'] for e in body] == ['Cxl']


def test_get_events_by_status_path_highlight_alias(client, db_session):
    make_event(db_session, name='Featured', status='Past', is_highlight=True)
    make_event(db_session, name='Plain', status='Past')
    body = client.get('/api/events/status/Highlight').json()
    assert [e['name'] for e in body] == ['Featured']


# ---------- GET single ----------

def test_get_event_by_id(client, db_session):
    event = make_event(db_session, name='Solo')
    body = client.get(f'/api/events/{event.id}').json()
    assert body['name'] == 'Solo'
    assert body['id'] == event.id


def test_get_event_404(client):
    resp = client.get('/api/events/999')
    assert resp.status_code == 404


# ---------- POST ----------

def test_create_requires_auth(client):
    assert client.post('/api/events', json=PAYLOAD).status_code == 401


def test_create_regular_member_forbidden(client, regular_member):
    resp = client.post('/api/events', json=PAYLOAD, headers=auth(regular_member))
    assert resp.status_code == 403


def test_create_event_committee(client, committee_member):
    resp = client.post('/api/events', json=PAYLOAD, headers=auth(committee_member))
    assert resp.status_code == 200
    body = resp.json()
    assert body['name'] == 'Sunday Long Run'
    assert body['status'] == 'Upcoming'
    assert body['event_type'] == 'standard'
    assert body['is_highlight'] is False


def test_create_event_admin(client, admin_member):
    resp = client.post('/api/events', json=PAYLOAD, headers=auth(admin_member))
    assert resp.status_code == 200


def test_create_event_validation_error(client, admin_member):
    resp = client.post('/api/events', json={'name': 'No date'}, headers=auth(admin_member))
    assert resp.status_code == 422


def test_create_legacy_highlight_past_date(client, admin_member):
    payload = dict(PAYLOAD, status='Highlight', date='2020-01-01')
    body = client.post('/api/events', json=payload, headers=auth(admin_member)).json()
    assert body['status'] == 'Past'
    assert body['is_highlight'] is True


def test_create_legacy_highlight_future_date(client, admin_member):
    future = (date.today() + timedelta(days=30)).isoformat()
    payload = dict(PAYLOAD, status='Highlight', date=future)
    body = client.post('/api/events', json=payload, headers=auth(admin_member)).json()
    assert body['status'] == 'Upcoming'
    assert body['is_highlight'] is True


# ---------- PUT ----------

def test_update_event(client, admin_member, db_session):
    event = make_event(db_session, name='Before')
    resp = client.put(
        f'/api/events/{event.id}',
        json={'name': 'After', 'location': 'Prospect Park'},
        headers=auth(admin_member),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['name'] == 'After'
    assert body['location'] == 'Prospect Park'
    assert body['status'] == 'Upcoming'  # untouched


def test_update_event_404(client, admin_member):
    resp = client.put('/api/events/999', json={'name': 'x'}, headers=auth(admin_member))
    assert resp.status_code == 404


def test_update_requires_auth(client, db_session):
    event = make_event(db_session)
    assert client.put(f'/api/events/{event.id}', json={'name': 'x'}).status_code == 401


def test_update_regular_member_forbidden(client, regular_member, db_session):
    event = make_event(db_session)
    resp = client.put(f'/api/events/{event.id}', json={'name': 'x'}, headers=auth(regular_member))
    assert resp.status_code == 403


def test_update_event_type_enum_converted(client, admin_member, db_session):
    event = make_event(db_session)
    body = client.put(
        f'/api/events/{event.id}',
        json={'event_type': 'heylo', 'heylo_embed': '<div/>'},
        headers=auth(admin_member),
    ).json()
    assert body['event_type'] == 'heylo'
    assert body['heylo_embed'] == '<div/>'


def test_update_legacy_highlight_uses_existing_past_date(client, admin_member, db_session):
    event = make_event(db_session, event_date=date(2020, 5, 1))
    body = client.put(
        f'/api/events/{event.id}',
        json={'status': 'Highlight'},
        headers=auth(admin_member),
    ).json()
    assert body['status'] == 'Past'
    assert body['is_highlight'] is True


def test_update_legacy_highlight_uses_existing_future_date(client, admin_member, db_session):
    event = make_event(db_session, event_date=date.today() + timedelta(days=10))
    body = client.put(
        f'/api/events/{event.id}',
        json={'status': 'Highlight'},
        headers=auth(admin_member),
    ).json()
    assert body['status'] == 'Upcoming'
    assert body['is_highlight'] is True


def test_update_legacy_highlight_with_new_date_in_payload(client, admin_member, db_session):
    event = make_event(db_session, event_date=date.today() + timedelta(days=10))
    body = client.put(
        f'/api/events/{event.id}',
        json={'status': 'Highlight', 'date': '2019-12-31'},
        headers=auth(admin_member),
    ).json()
    assert body['status'] == 'Past'
    assert body['date'] == '2019-12-31'


def test_update_plain_status(client, admin_member, db_session):
    event = make_event(db_session, status='Upcoming')
    body = client.put(
        f'/api/events/{event.id}',
        json={'status': 'Cancelled'},
        headers=auth(admin_member),
    ).json()
    assert body['status'] == 'Cancelled'
    assert body['is_highlight'] is False


# ---------- DELETE ----------

def test_delete_event(client, admin_member, db_session):
    event = make_event(db_session)
    resp = client.delete(f'/api/events/{event.id}', headers=auth(admin_member))
    assert resp.status_code == 200
    assert client.get(f'/api/events/{event.id}').status_code == 404


def test_delete_event_404(client, admin_member):
    assert client.delete('/api/events/999', headers=auth(admin_member)).status_code == 404


def test_delete_requires_auth(client, db_session):
    event = make_event(db_session)
    assert client.delete(f'/api/events/{event.id}').status_code == 401


def test_delete_regular_member_forbidden(client, regular_member, db_session):
    event = make_event(db_session)
    resp = client.delete(f'/api/events/{event.id}', headers=auth(regular_member))
    assert resp.status_code == 403


def test_delete_event_cascades_related_rows_and_unlinks_children(
    client, admin_member, regular_member, db_session
):
    event = make_event(db_session, name='Parent', is_recurring=True)
    child = make_event(db_session, name='Child', parent_event_id=event.id)

    db_session.add(EventCommentSettings(event_id=event.id))
    db_session.add(Comment(
        event_id=event.id, member_id=regular_member.id,
        firebase_uid=regular_member.firebase_uid, content='hi',
    ))
    db_session.add(Like(event_id=event.id, member_id=regular_member.id))
    db_session.add(Reaction(event_id=event.id, member_id=regular_member.id, emoji='🎉'))
    db_session.add(EventGalleryImage(event_id=event.id, image_url='http://x/img.jpg'))
    db_session.add(EventRecurrenceRule(event_id=event.id, recurrence_type='weekly'))
    db_session.commit()

    resp = client.delete(f'/api/events/{event.id}', headers=auth(admin_member))
    assert resp.status_code == 200

    assert db_session.query(Event).filter(Event.id == event.id).first() is None
    assert db_session.query(Comment).filter(Comment.event_id == event.id).count() == 0
    assert db_session.query(Like).filter(Like.event_id == event.id).count() == 0
    assert db_session.query(Reaction).filter(Reaction.event_id == event.id).count() == 0
    assert db_session.query(EventCommentSettings).filter(
        EventCommentSettings.event_id == event.id).count() == 0
    assert db_session.query(EventGalleryImage).filter(
        EventGalleryImage.event_id == event.id).count() == 0
    assert db_session.query(EventRecurrenceRule).filter(
        EventRecurrenceRule.event_id == event.id).count() == 0

    db_session.refresh(child)
    assert child.parent_event_id is None
