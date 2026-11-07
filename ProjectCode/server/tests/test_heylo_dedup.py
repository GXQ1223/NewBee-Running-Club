"""Dedup hardening tests for routes/heylo_sync.py.

Covers the duplicate paths beyond the plain signup_link upsert:
re-applying an identical list is a pure no-op, a payload that lists
the same Heylo URL twice creates one event (keeping the most
complete record), and items pushed without a signup_link are matched
on date + normalized title instead of blindly inserting.
"""
from datetime import date, timedelta

from database import Event
from tests.conftest import auth

RUN_DATE = (date.today() + timedelta(days=3)).isoformat()


def _item(**overrides):
    item = {
        'name': 'Wednesday Night Run',
        'date': RUN_DATE,
        'time': '6:30 PM',
        'location': 'Central Park',
        'description': 'Easy miles with the crew.',
        'signup_link': 'https://www.heylo.com/event/wed-night-run',
    }
    item.update(overrides)
    return item


def _sync(client, member, activities):
    return client.post(
        '/api/heylo/sync', json={'activities': activities}, headers=auth(member),
    )


# ---------- repeat runs are a pure no-op ----------

def test_reapplying_same_list_creates_and_updates_nothing(client, db_session, admin_member):
    items = [
        _item(),
        _item(name='Saturday Long Run', signup_link='https://www.heylo.com/event/sat-long'),
    ]
    first = _sync(client, admin_member, items).json()
    assert first['created'] == 2

    second = _sync(client, admin_member, items).json()
    assert second['created'] == 0
    assert second['updated'] == 0
    assert second['unchanged'] == 2
    assert db_session.query(Event).count() == 2


# ---------- duplicates inside one payload ----------

def test_duplicate_url_within_one_payload_creates_one_event(client, db_session, admin_member):
    sparse = _item()
    richer = _item(image='https://example.com/run.jpg', chinese_name='周三夜跑')
    body = _sync(client, admin_member, [sparse, richer]).json()

    assert body['created'] == 1
    assert body['updated'] == 0
    assert len(body['results']) == 1

    event = db_session.query(Event).one()
    # The merged record kept the fields only the richer copy carried.
    assert event.image == 'https://example.com/run.jpg'
    assert event.chinese_name == '周三夜跑'
    assert event.location == 'Central Park'


def test_duplicate_linkless_items_within_one_payload_create_one_event(
    client, db_session, admin_member
):
    first = _item()
    del first['signup_link']
    second = _item()
    del second['signup_link']
    body = _sync(client, admin_member, [first, second]).json()

    assert body['created'] == 1
    assert db_session.query(Event).count() == 1


# ---------- missing / empty signup_link fallback ----------

def test_linkless_push_matches_existing_event_by_date_and_title(
    client, db_session, admin_member
):
    _sync(client, admin_member, [_item()])  # created WITH the link

    linkless = _item(location='Prospect Park')
    del linkless['signup_link']
    body = _sync(client, admin_member, [linkless]).json()

    assert body['created'] == 0
    assert body['updated'] == 1
    event = db_session.query(Event).one()
    assert event.location == 'Prospect Park'
    # The stored Heylo link survives the link-less update.
    assert event.signup_link == 'https://www.heylo.com/event/wed-night-run'


def test_linkless_match_ignores_title_case_and_whitespace(
    client, db_session, admin_member
):
    _sync(client, admin_member, [_item()])

    linkless = _item(name='  wednesday   night RUN ', signup_link=None)
    body = _sync(client, admin_member, [linkless]).json()

    assert body['created'] == 0
    assert db_session.query(Event).count() == 1


def test_linkless_create_then_repush_is_idempotent(client, db_session, admin_member):
    linkless = _item()
    del linkless['signup_link']

    first = _sync(client, admin_member, [linkless]).json()
    assert first['created'] == 1

    second = _sync(client, admin_member, [linkless]).json()
    assert second['created'] == 0
    assert second['updated'] == 0
    assert second['unchanged'] == 1
    event = db_session.query(Event).one()
    assert event.signup_link is None


def test_linkless_item_with_same_title_but_other_date_creates_new_event(
    client, db_session, admin_member
):
    _sync(client, admin_member, [_item()])

    other_day = _item(date=(date.today() + timedelta(days=10)).isoformat())
    del other_day['signup_link']
    body = _sync(client, admin_member, [other_day]).json()

    assert body['created'] == 1
    assert db_session.query(Event).count() == 2


def test_linkless_fallback_does_not_hijack_standard_events(
    client, db_session, admin_member
):
    """A standard (non-Heylo) event with the same date+title is not matched."""
    from tests.helpers_events import make_event
    make_event(
        db_session,
        name='Wednesday Night Run',
        event_date=date.today() + timedelta(days=3),
    )
    linkless = _item()
    del linkless['signup_link']
    body = _sync(client, admin_member, [linkless]).json()

    assert body['created'] == 1
    assert db_session.query(Event).count() == 2


def test_whitespace_padded_link_matches_stored_link(client, db_session, admin_member):
    _sync(client, admin_member, [_item()])
    padded = _item(signup_link='  https://www.heylo.com/event/wed-night-run  ')
    body = _sync(client, admin_member, [padded]).json()

    assert body['created'] == 0
    assert body['unchanged'] == 1
    assert db_session.query(Event).count() == 1
