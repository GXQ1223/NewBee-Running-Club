"""Tests for /api/club-rules (yearly Club Entry rule revisions)."""
from tests.conftest import auth, make_member


PAYLOAD_2025 = {'year_label': '2025', 'title': '2025 年赛事规则', 'content': '<p>rules v2025</p>', 'is_current': True}
PAYLOAD_2026 = {'year_label': '2026', 'title': '2026 年赛事规则', 'content': '<p>rules v2026</p>', 'is_current': True}


def test_get_empty(client):
    resp = client.get('/api/club-rules')
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_requires_auth(client):
    resp = client.post('/api/club-rules', json=PAYLOAD_2025)
    assert resp.status_code == 401


def test_regular_member_cannot_create(client, regular_member):
    resp = client.post('/api/club-rules', json=PAYLOAD_2025, headers=auth(regular_member))
    assert resp.status_code == 403


def test_unknown_uid_rejected(client, db_session):
    resp = client.post('/api/club-rules', json=PAYLOAD_2025, headers={'X-Firebase-UID': 'nobody'})
    assert resp.status_code == 401


def test_committee_can_create(client, committee_member):
    resp = client.post('/api/club-rules', json=PAYLOAD_2025, headers=auth(committee_member))
    assert resp.status_code == 200
    body = resp.json()
    assert body['year_label'] == '2025'
    assert body['is_current'] is True
    assert body['created_by'] == committee_member.display_name


def test_new_current_archives_previous(client, admin_member):
    first = client.post('/api/club-rules', json=PAYLOAD_2025, headers=auth(admin_member)).json()
    client.post('/api/club-rules', json=PAYLOAD_2026, headers=auth(admin_member))

    versions = client.get('/api/club-rules').json()
    assert len(versions) == 2
    # Current first, and only one current
    assert versions[0]['year_label'] == '2026'
    assert versions[0]['is_current'] is True
    by_id = {v['id']: v for v in versions}
    assert by_id[first['id']]['is_current'] is False


def test_create_archived_version_keeps_current(client, admin_member):
    client.post('/api/club-rules', json=PAYLOAD_2025, headers=auth(admin_member))
    archived = dict(PAYLOAD_2026, is_current=False, year_label='2024')
    client.post('/api/club-rules', json=archived, headers=auth(admin_member))

    versions = client.get('/api/club-rules').json()
    currents = [v for v in versions if v['is_current']]
    assert len(currents) == 1
    assert currents[0]['year_label'] == '2025'


def test_update_version(client, admin_member):
    created = client.post('/api/club-rules', json=PAYLOAD_2025, headers=auth(admin_member)).json()
    resp = client.put(
        f"/api/club-rules/{created['id']}",
        json={'title': 'Updated title'},
        headers=auth(admin_member),
    )
    assert resp.status_code == 200
    assert resp.json()['title'] == 'Updated title'
    assert resp.json()['is_current'] is True  # untouched fields preserved


def test_update_to_current_archives_others(client, admin_member):
    v1 = client.post('/api/club-rules', json=PAYLOAD_2025, headers=auth(admin_member)).json()
    v2 = client.post('/api/club-rules', json=PAYLOAD_2026, headers=auth(admin_member)).json()

    client.put(f"/api/club-rules/{v1['id']}", json={'is_current': True}, headers=auth(admin_member))

    versions = {v['id']: v for v in client.get('/api/club-rules').json()}
    assert versions[v1['id']]['is_current'] is True
    assert versions[v2['id']]['is_current'] is False


def test_update_missing_404(client, admin_member):
    resp = client.put('/api/club-rules/999', json={'title': 'x'}, headers=auth(admin_member))
    assert resp.status_code == 404


def test_delete_version(client, admin_member):
    created = client.post('/api/club-rules', json=PAYLOAD_2025, headers=auth(admin_member)).json()
    resp = client.delete(f"/api/club-rules/{created['id']}", headers=auth(admin_member))
    assert resp.status_code == 200
    assert client.get('/api/club-rules').json() == []


def test_delete_missing_404(client, admin_member):
    resp = client.delete('/api/club-rules/999', headers=auth(admin_member))
    assert resp.status_code == 404


def test_delete_requires_committee(client, regular_member, admin_member):
    created = client.post('/api/club-rules', json=PAYLOAD_2025, headers=auth(admin_member)).json()
    resp = client.delete(f"/api/club-rules/{created['id']}", headers=auth(regular_member))
    assert resp.status_code == 403


def test_pending_member_cannot_create(client, db_session):
    pending = make_member(db_session, status='pending', uid='pending-uid')
    resp = client.post('/api/club-rules', json=PAYLOAD_2025, headers=auth(pending))
    assert resp.status_code == 403
