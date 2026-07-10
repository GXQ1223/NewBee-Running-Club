"""Tests for /api/meeting-minutes (admin-managed meeting notes)."""
from tests.conftest import auth


PAYLOAD = {
    'title': 'January Committee Meeting',
    'meeting_date': '2025-01-10',
    'content': '<p>Discussed race calendar.</p>',
}


def create_minutes(client, admin_member, **overrides):
    payload = dict(PAYLOAD)
    payload.update(overrides)
    resp = client.post('/api/meeting-minutes', json=payload, headers=auth(admin_member))
    assert resp.status_code == 200
    return resp.json()


# ---------------------------------------------------------------- read

def test_get_all_empty(client):
    resp = client.get('/api/meeting-minutes')
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_all_sorted_by_meeting_date_desc(client, admin_member):
    create_minutes(client, admin_member, title='Old', meeting_date='2024-01-01')
    create_minutes(client, admin_member, title='New', meeting_date='2025-03-01')
    create_minutes(client, admin_member, title='Mid', meeting_date='2024-06-15')

    titles = [m['title'] for m in client.get('/api/meeting-minutes').json()]
    assert titles == ['New', 'Mid', 'Old']


def test_get_one(client, admin_member):
    created = create_minutes(client, admin_member)
    resp = client.get(f"/api/meeting-minutes/{created['id']}")
    assert resp.status_code == 200
    body = resp.json()
    assert body['title'] == PAYLOAD['title']
    assert body['meeting_date'] == PAYLOAD['meeting_date']
    assert body['content'] == PAYLOAD['content']


def test_get_one_404(client):
    assert client.get('/api/meeting-minutes/999').status_code == 404


# ---------------------------------------------------------------- create

def test_create_requires_auth(client):
    assert client.post('/api/meeting-minutes', json=PAYLOAD).status_code == 401


def test_create_rejects_regular_member(client, regular_member):
    resp = client.post('/api/meeting-minutes', json=PAYLOAD, headers=auth(regular_member))
    assert resp.status_code == 403


def test_create_rejects_committee(client, committee_member):
    # Meeting minutes are admin-only, stricter than committee
    resp = client.post('/api/meeting-minutes', json=PAYLOAD, headers=auth(committee_member))
    assert resp.status_code == 403


def test_create_sets_creator_fields(client, admin_member):
    created = create_minutes(client, admin_member)
    assert created['created_by'] == admin_member.display_name
    assert created['created_by_id'] == admin_member.id


def test_create_validation_error(client, admin_member):
    resp = client.post('/api/meeting-minutes',
                       json={'title': 'Missing fields'},
                       headers=auth(admin_member))
    assert resp.status_code == 422


# ---------------------------------------------------------------- update

def test_update_partial(client, admin_member):
    created = create_minutes(client, admin_member)
    resp = client.put(f"/api/meeting-minutes/{created['id']}",
                      json={'title': 'Renamed'}, headers=auth(admin_member))
    assert resp.status_code == 200
    body = resp.json()
    assert body['title'] == 'Renamed'
    assert body['content'] == PAYLOAD['content']  # untouched
    assert body['meeting_date'] == PAYLOAD['meeting_date']


def test_update_404(client, admin_member):
    resp = client.put('/api/meeting-minutes/999', json={'title': 'x'},
                      headers=auth(admin_member))
    assert resp.status_code == 404


def test_update_requires_admin(client, admin_member, committee_member):
    created = create_minutes(client, admin_member)
    resp = client.put(f"/api/meeting-minutes/{created['id']}",
                      json={'title': 'x'}, headers=auth(committee_member))
    assert resp.status_code == 403


# ---------------------------------------------------------------- delete

def test_delete(client, admin_member):
    created = create_minutes(client, admin_member)
    resp = client.delete(f"/api/meeting-minutes/{created['id']}", headers=auth(admin_member))
    assert resp.status_code == 200
    assert client.get('/api/meeting-minutes').json() == []


def test_delete_404(client, admin_member):
    assert client.delete('/api/meeting-minutes/999',
                         headers=auth(admin_member)).status_code == 404


def test_delete_requires_auth(client, admin_member):
    created = create_minutes(client, admin_member)
    assert client.delete(f"/api/meeting-minutes/{created['id']}").status_code == 401
