"""Tests for the server-side Heylo fetch (POST /api/heylo/sync-now).

Parser tests run against real Heylo pages saved under tests/fixtures/
(captured 2026-11-06; Firebase image tokens scrubbed). Endpoint tests
mock routes.heylo_sync._fetch_heylo_activities so no network is used.
"""
import json
import re
from datetime import date
from pathlib import Path

import pytest
import requests

from database import Event
from models import HeyloActivityItem
from routes import heylo_sync
from tests.conftest import auth

FIXTURES = Path(__file__).parent / 'fixtures'
GROUP_HTML = (FIXTURES / 'heylo_group_page.html').read_text(encoding='utf-8')
EVENT_HTML = (FIXTURES / 'heylo_event_page.html').read_text(encoding='utf-8')

SAT_RUN_ID = '-P5lrQQcfwgzQxcRGhav'


def _fake_fetch(url):
    """Serve the saved fixtures for any Heylo URL.

    The single saved event page is re-stamped with the id + timestamp
    the group fixture lists for that event, so past events stay past.
    """
    if '/g/' in url:
        return GROUP_HTML
    if '/event/' in url:
        event_id = url.rsplit('/event/', 1)[1]
        summaries = {
            s['id']: s for s in heylo_sync._parse_group_event_summaries(GROUP_HTML)
        }
        timestamp = summaries[event_id]['timestamp']
        return EVENT_HTML.replace(SAT_RUN_ID, event_id).replace(
            '1794054600000', str(timestamp)
        )
    raise AssertionError(f'unexpected URL {url}')


# ---------- group page parsing ----------

def test_parse_group_summaries_from_real_page():
    summaries = heylo_sync._parse_group_event_summaries(GROUP_HTML)
    assert len(summaries) == 9
    by_id = {s['id']: s for s in summaries}
    assert by_id[SAT_RUN_ID]['name'] == '🐝 NewBee Saturday Central Park Run'
    assert by_id[SAT_RUN_ID]['timestamp'] == 1794054600000


def test_parse_group_summaries_unparseable_page():
    assert heylo_sync._parse_group_event_summaries('<html>no data</html>') == []


# ---------- event page parsing ----------

def test_parse_event_detail_from_real_page():
    event = heylo_sync._parse_event_detail(EVENT_HTML)
    assert event is not None
    assert event['name'] == '🐝 NewBee Saturday Central Park Run'
    assert event['timezone'] == 'America/New_York'


def test_parse_event_detail_unparseable_page():
    assert heylo_sync._parse_event_detail('<html>no data</html>') is None


def test_event_to_item_converts_timestamp_in_event_timezone():
    event = heylo_sync._parse_event_detail(EVENT_HTML)
    item = heylo_sync._event_to_item(event, SAT_RUN_ID)
    # 1794054600000 ms = 2026-11-07 07:30 in America/New_York
    assert item.date == date(2026, 11, 7)
    assert item.time == '7:30 AM'
    assert item.name == '🐝 NewBee Saturday Central Park Run'
    assert item.location == '7点半电梯入口集合, 7:35准时出发，如果需要上厕所请提前到达'
    assert item.description == '可以注明自己要跑的距离和配速；一开始的10分钟建议所有人一起热身跑。'
    assert item.signup_link == f'https://www.heylo.com/event/{SAT_RUN_ID}'
    assert item.status is None


def test_event_to_item_empty_fields_become_none():
    event = heylo_sync._parse_event_detail(EVENT_HTML)
    event = {**event, 'location': '', 'notes': '  ', 'image': ''}
    item = heylo_sync._event_to_item(event, 'abc')
    assert item.location is None
    assert item.description is None
    assert item.image is None


# ---------- the full fetch pipeline (fixture-backed, no network) ----------

def test_fetch_activities_skips_past_events(monkeypatch):
    monkeypatch.setattr(heylo_sync, '_fetch_html', _fake_fetch)
    items = heylo_sync._fetch_heylo_activities(today=date(2026, 11, 6))
    # The group fixture lists 9 events; the 2025 team-uniform signup is
    # dated 2026-09-21, so only the 8 upcoming ones are returned.
    assert len(items) == 8
    links = {i.signup_link for i in items}
    assert f'https://www.heylo.com/event/{SAT_RUN_ID}' in links
    assert 'https://www.heylo.com/event/-OPcA0J1650pnTqbetvn' not in links
    assert all(i.date >= date(2026, 11, 6) for i in items)


def test_fetch_activities_raises_on_unparseable_group_page(monkeypatch):
    monkeypatch.setattr(heylo_sync, '_fetch_html', lambda url: '<html></html>')
    with pytest.raises(heylo_sync.HeyloFetchError):
        heylo_sync._fetch_heylo_activities(today=date(2026, 11, 6))


# ---------- POST /sync-now endpoint ----------

def _item(**overrides):
    item = HeyloActivityItem(
        name='Saturday Central Park Run',
        date=date(2026, 11, 7),
        time='7:30 AM',
        location='Central Park',
        signup_link='https://www.heylo.com/event/sat-run',
    )
    return item.model_copy(update=overrides)


def test_sync_now_requires_auth(client):
    resp = client.post('/api/heylo/sync-now')
    assert resp.status_code == 401


def test_sync_now_forbidden_for_regular_member(client, regular_member):
    resp = client.post('/api/heylo/sync-now', headers=auth(regular_member))
    assert resp.status_code == 403


def test_sync_now_creates_events_and_reports_changes(client, db_session, admin_member, monkeypatch):
    monkeypatch.setattr(heylo_sync, '_fetch_heylo_activities', lambda: [_item()])
    resp = client.post('/api/heylo/sync-now', headers=auth(admin_member))
    assert resp.status_code == 200
    body = resp.json()
    assert body['created'] == 1
    assert body['updated'] == 0
    assert body['changes'] == [
        {'name': 'Saturday Central Park Run', 'date': '2026-11-07', 'action': 'created'},
    ]
    event = db_session.query(Event).one()
    assert event.event_type == 'heylo'
    assert event.status == 'Upcoming'

    # Second run: everything already matches -> unchanged, no changes listed.
    resp = client.post('/api/heylo/sync-now', headers=auth(admin_member))
    body = resp.json()
    assert body['unchanged'] == 1
    assert body['changes'] == []


def test_sync_now_allows_committee(client, committee_member, monkeypatch):
    monkeypatch.setattr(heylo_sync, '_fetch_heylo_activities', lambda: [_item()])
    resp = client.post('/api/heylo/sync-now', headers=auth(committee_member))
    assert resp.status_code == 200


def test_sync_now_fetch_failure_writes_nothing(client, db_session, admin_member, monkeypatch):
    def boom():
        raise requests.ConnectionError('heylo unreachable')
    monkeypatch.setattr(heylo_sync, '_fetch_heylo_activities', boom)
    resp = client.post('/api/heylo/sync-now', headers=auth(admin_member))
    assert resp.status_code == 502
    assert 'Failed to read Heylo' in resp.json()['detail']
    assert db_session.query(Event).count() == 0


def test_sync_now_parse_failure_writes_nothing(client, db_session, admin_member, monkeypatch):
    def boom():
        raise heylo_sync.HeyloFetchError('No events found on the Heylo group page.')
    monkeypatch.setattr(heylo_sync, '_fetch_heylo_activities', boom)
    resp = client.post('/api/heylo/sync-now', headers=auth(admin_member))
    assert resp.status_code == 502
    assert db_session.query(Event).count() == 0


def test_sync_now_zero_activities_writes_nothing(client, db_session, admin_member, monkeypatch):
    monkeypatch.setattr(heylo_sync, '_fetch_heylo_activities', lambda: [])
    resp = client.post('/api/heylo/sync-now', headers=auth(admin_member))
    assert resp.status_code == 502
    assert 'No upcoming Heylo activities' in resp.json()['detail']
    assert db_session.query(Event).count() == 0


# ---------- fixture hygiene ----------

def test_fixtures_are_real_pages_with_scrubbed_tokens():
    for html in (GROUP_HTML, EVENT_HTML):
        assert '__NEXT_DATA__' in html
        assert not re.search(r'token=[0-9a-fA-F-]{36}(?![0-9a-fA-F-])', html.replace('token=FIXTURE-TOKEN', ''))
        json.loads(re.search(
            r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
            html, re.S,
        ).group(1))
