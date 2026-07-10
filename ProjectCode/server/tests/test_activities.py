"""Tests for routes/activities.py — offline activity submission & verification."""
import pytest

from database import MemberActivity
from tests.conftest import auth, make_member


ACTIVITY_1 = {
    'activity_number': 1,
    'event_name': 'Saturday Long Run',
    'event_date': '2026-06-01',
    'description': 'ran with the club',
    'proof_url': 'http://img/proof1.png',
}
ACTIVITY_2 = dict(ACTIVITY_1, activity_number=2, event_name='Tuesday Track')


@pytest.fixture()
def runner(db_session):
    return make_member(db_session, status='runner', uid='runner-1')


def submit(client, member_id, payload):
    return client.post(f'/api/members/{member_id}/activities', json=payload)


# ------------------------------------------------------------------ GET activities

def test_get_activities_empty(client, runner):
    resp = client.get(f'/api/members/{runner.id}/activities')
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_activities_ordered_by_number(client, runner):
    submit(client, runner.id, ACTIVITY_2)
    submit(client, runner.id, ACTIVITY_1)
    resp = client.get(f'/api/members/{runner.id}/activities')
    assert [a['activity_number'] for a in resp.json()] == [1, 2]


# ----------------------------------------------------------------- POST activities

def test_submit_activity(client, db_session, runner):
    resp = submit(client, runner.id, ACTIVITY_1)
    assert resp.status_code == 200
    body = resp.json()
    assert body['status'] == 'pending'
    assert body['member_id'] == runner.id
    assert body['event_name'] == 'Saturday Long Run'

    db_session.refresh(runner)
    assert runner.activities_completed == 1


def test_submit_second_activity_updates_count(client, db_session, runner):
    submit(client, runner.id, ACTIVITY_1)
    submit(client, runner.id, ACTIVITY_2)
    db_session.refresh(runner)
    assert runner.activities_completed == 2


def test_submit_activity_member_404(client):
    assert submit(client, 999, ACTIVITY_1).status_code == 404


def test_submit_duplicate_activity_number_400(client, runner):
    submit(client, runner.id, ACTIVITY_1)
    resp = submit(client, runner.id, dict(ACTIVITY_1, event_name='Another Run'))
    assert resp.status_code == 400
    assert 'already submitted' in resp.json()['detail']


def test_submit_activity_number_out_of_range_422(client, runner):
    resp = submit(client, runner.id, dict(ACTIVITY_1, activity_number=3))
    assert resp.status_code == 422


# ----------------------------------------------------------------------- verify

def test_verify_requires_auth(client, runner):
    aid = submit(client, runner.id, ACTIVITY_1).json()['id']
    resp = client.put(f'/api/activities/{aid}/verify', json={'approved': True})
    assert resp.status_code == 401


def test_verify_regular_forbidden(client, runner, regular_member):
    aid = submit(client, runner.id, ACTIVITY_1).json()['id']
    resp = client.put(f'/api/activities/{aid}/verify', json={'approved': True},
                      headers=auth(regular_member))
    assert resp.status_code == 403


def test_verify_404(client, admin_member):
    resp = client.put('/api/activities/999/verify', json={'approved': True},
                      headers=auth(admin_member))
    assert resp.status_code == 404


def test_verify_approve(client, db_session, runner, committee_member):
    aid = submit(client, runner.id, ACTIVITY_1).json()['id']
    resp = client.put(f'/api/activities/{aid}/verify', json={'approved': True},
                      headers=auth(committee_member))
    assert resp.status_code == 200
    assert resp.json()['status'] == 'verified'

    activity = db_session.query(MemberActivity).filter(MemberActivity.id == aid).first()
    assert activity.status == 'verified'
    assert activity.verified_by == committee_member.id
    assert activity.verified_at is not None


def test_verify_already_decided_400(client, runner, admin_member):
    aid = submit(client, runner.id, ACTIVITY_1).json()['id']
    client.put(f'/api/activities/{aid}/verify', json={'approved': True}, headers=auth(admin_member))
    resp = client.put(f'/api/activities/{aid}/verify', json={'approved': True},
                      headers=auth(admin_member))
    assert resp.status_code == 400
    assert 'already verified' in resp.json()['detail']


def test_reject_requires_reason(client, runner, admin_member):
    aid = submit(client, runner.id, ACTIVITY_1).json()['id']
    resp = client.put(f'/api/activities/{aid}/verify', json={'approved': False},
                      headers=auth(admin_member))
    assert resp.status_code == 400


def test_reject_blank_reason_400(client, runner, admin_member):
    aid = submit(client, runner.id, ACTIVITY_1).json()['id']
    resp = client.put(f'/api/activities/{aid}/verify',
                      json={'approved': False, 'rejection_reason': '   '},
                      headers=auth(admin_member))
    assert resp.status_code == 400


def test_reject_with_reason(client, db_session, runner, admin_member):
    aid = submit(client, runner.id, ACTIVITY_1).json()['id']
    resp = client.put(f'/api/activities/{aid}/verify',
                      json={'approved': False, 'rejection_reason': 'no proof'},
                      headers=auth(admin_member))
    assert resp.status_code == 200
    assert resp.json()['status'] == 'rejected'

    activity = db_session.query(MemberActivity).filter(MemberActivity.id == aid).first()
    assert activity.rejection_reason == 'no proof'


# ---------------------------------------------------------------- pending activities

def test_pending_activities_requires_auth(client):
    assert client.get('/api/activities/pending').status_code == 401


def test_pending_activities_regular_forbidden(client, regular_member):
    assert client.get('/api/activities/pending', headers=auth(regular_member)).status_code == 403


def test_pending_activities_filters_status(client, runner, committee_member):
    aid1 = submit(client, runner.id, ACTIVITY_1).json()['id']
    aid2 = submit(client, runner.id, ACTIVITY_2).json()['id']
    client.put(f'/api/activities/{aid1}/verify', json={'approved': True},
               headers=auth(committee_member))

    resp = client.get('/api/activities/pending', headers=auth(committee_member))
    assert resp.status_code == 200
    assert [a['id'] for a in resp.json()] == [aid2]


# ----------------------------------------------------------------------- delete

def test_delete_activity_requires_auth(client, runner):
    aid = submit(client, runner.id, ACTIVITY_1).json()['id']
    assert client.delete(f'/api/activities/{aid}').status_code == 401


def test_delete_activity_regular_forbidden(client, runner, regular_member):
    aid = submit(client, runner.id, ACTIVITY_1).json()['id']
    assert client.delete(f'/api/activities/{aid}', headers=auth(regular_member)).status_code == 403


def test_delete_activity_404(client, admin_member):
    assert client.delete('/api/activities/999', headers=auth(admin_member)).status_code == 404


def test_delete_activity_updates_count(client, db_session, runner, admin_member):
    aid = submit(client, runner.id, ACTIVITY_1).json()['id']
    submit(client, runner.id, ACTIVITY_2)

    resp = client.delete(f'/api/activities/{aid}', headers=auth(admin_member))
    assert resp.status_code == 200
    db_session.refresh(runner)
    assert runner.activities_completed == 1
    assert client.get(f'/api/members/{runner.id}/activities').json()[0]['activity_number'] == 2


def test_delete_orphan_activity(client, db_session, admin_member):
    """Activity whose member no longer exists — count update is skipped safely."""
    import datetime
    orphan = MemberActivity(
        member_id=9999, activity_number=1, event_name='Ghost Run',
        event_date=datetime.date(2026, 1, 1), status='pending',
    )
    db_session.add(orphan)
    db_session.commit()

    resp = client.delete(f'/api/activities/{orphan.id}', headers=auth(admin_member))
    assert resp.status_code == 200
