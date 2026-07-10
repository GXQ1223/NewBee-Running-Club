"""Tests for routes/members.py — member CRUD, auth sync, approvals, newsletter."""
import pytest

import email_service
from tests.conftest import auth, make_member


EMAIL_METHODS = [
    'send_email',
    'send_join_confirmation',
    'send_committee_notification',
    'send_approval_notification',
    'send_rejection_notification',
    'send_existing_member_account_notification',
]


@pytest.fixture(autouse=True)
def email_calls(monkeypatch):
    """Stub out every EmailService send method so tests never touch SMTP."""
    calls = []

    def recorder(name):
        def _rec(*args, **kwargs):
            calls.append((name, args, kwargs))
            return True
        return _rec

    for name in EMAIL_METHODS:
        monkeypatch.setattr(email_service.EmailService, name, recorder(name))
    return calls


def raise_error(*args, **kwargs):
    raise RuntimeError('smtp down')


NEW_MEMBER = {
    'username': 'newuser',
    'email': 'newuser@test.local',
    'password': 'secret-pass-123',
}

JOIN_PAYLOAD = {
    'first_name': 'Al',
    'last_name': 'Bee',
    'nickname': 'AB',
    'email': 'albee@test.local',
    'nyrr_id': 'NYRR123',
    'running_experience': '2 years',
    'location': 'NYC',
    'weekly_frequency': '3x per week',
    'monthly_mileage': '100 km',
    'race_experience': 'Brooklyn Half',
    'goals': 'BQ',
    'introduction': 'hello',
}


# ---------------------------------------------------------------- GET /api/members

def test_get_members_public_filters_statuses(client, db_session):
    make_member(db_session, status='runner', uid='r1')
    make_member(db_session, status='pending', uid='p1')
    make_member(db_session, status='rejected', uid='x1')

    resp = client.get('/api/members')
    assert resp.status_code == 200
    body = resp.json()
    assert [m['status'] for m in body] == ['runner']
    assert 'email' not in body[0]  # public response has no sensitive fields


def test_get_members_admin_sees_all(client, db_session, admin_member):
    make_member(db_session, status='runner', uid='r1')
    make_member(db_session, status='pending', uid='p1')

    resp = client.get('/api/members', headers=auth(admin_member))
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 3  # admin + runner + pending
    assert all('email' in m for m in body)


def test_get_members_committee_sees_all(client, db_session, committee_member):
    make_member(db_session, status='pending', uid='p1')
    resp = client.get('/api/members', headers=auth(committee_member))
    assert len(resp.json()) == 2


def test_get_members_unknown_uid_gets_public_view(client, db_session):
    make_member(db_session, status='runner', uid='r1')
    make_member(db_session, status='pending', uid='p1')
    resp = client.get('/api/members', headers={'X-Firebase-UID': 'nobody'})
    body = resp.json()
    assert len(body) == 1
    assert 'email' not in body[0]


# ---------------------------------------------------------- GET /api/members/credits

def test_members_for_credits_filters_and_sorts(client, db_session):
    make_member(db_session, status='runner', uid='low',
                registration_credits=1, checkin_credits=0,
                volunteer_credits=0, activity_credits=0)
    make_member(db_session, status='runner', uid='high',
                registration_credits=5, checkin_credits=5,
                volunteer_credits=5, activity_credits=5)
    make_member(db_session, status='runner', uid='hidden', show_in_credits=False)
    make_member(db_session, status='pending', uid='pend')  # wrong status

    resp = client.get('/api/members/credits')
    assert resp.status_code == 200
    body = resp.json()
    assert [m['username'] for m in body] == ['user_high', 'user_low']


# ------------------------------------------------------- GET member by id / username

def test_get_member_by_id(client, db_session):
    m = make_member(db_session, status='runner', uid='r1')
    resp = client.get(f'/api/members/{m.id}')
    assert resp.status_code == 200
    assert resp.json()['username'] == m.username


def test_get_member_by_id_404(client):
    assert client.get('/api/members/999').status_code == 404


def test_get_member_by_username(client, db_session):
    m = make_member(db_session, status='runner', uid='r1')
    resp = client.get(f'/api/members/username/{m.username}')
    assert resp.status_code == 200
    assert resp.json()['id'] == m.id


def test_get_member_by_username_404(client):
    assert client.get('/api/members/username/ghost').status_code == 404


# ------------------------------------------------------------------ POST /api/members

def test_create_member(client):
    resp = client.post('/api/members', json=NEW_MEMBER)
    assert resp.status_code == 200
    body = resp.json()
    assert body['username'] == 'newuser'
    assert body['status'] == 'pending'
    assert 'password' not in body and 'password_hash' not in body


def test_create_member_duplicate_username(client, db_session):
    make_member(db_session, status='runner', uid='r1', username='newuser')
    resp = client.post('/api/members', json=NEW_MEMBER)
    assert resp.status_code == 400
    assert 'Username' in resp.json()['detail']


def test_create_member_duplicate_email(client, db_session):
    make_member(db_session, status='runner', uid='r1', email='newuser@test.local')
    resp = client.post('/api/members', json=NEW_MEMBER)
    assert resp.status_code == 400
    assert 'Email' in resp.json()['detail']


def test_create_member_short_password_422(client):
    resp = client.post('/api/members', json=dict(NEW_MEMBER, password='short'))
    assert resp.status_code == 422


# ------------------------------------------------------------------- PUT /api/members

def test_update_member_404(client):
    assert client.put('/api/members/999', json={'nickname': 'x'}).status_code == 404


def test_update_member_locked_display_name_for_non_admin(client, db_session):
    m = make_member(db_session, status='runner', uid='r1', display_name='Real Name')
    resp = client.put(
        f'/api/members/{m.id}',
        json={'display_name': 'Impostor', 'nickname': 'Speedy'},
        headers=auth(m),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['display_name'] == 'Real Name'  # locked field kept
    assert body['nickname'] == 'Speedy'         # other field updated


def test_update_member_can_set_empty_display_name(client, db_session):
    m = make_member(db_session, status='runner', uid='r1', display_name=None)
    resp = client.put(f'/api/members/{m.id}', json={'display_name': 'First Set'}, headers=auth(m))
    assert resp.json()['display_name'] == 'First Set'


def test_update_member_admin_can_change_locked_field(client, db_session, admin_member):
    m = make_member(db_session, status='runner', uid='r1', display_name='Real Name')
    resp = client.put(
        f'/api/members/{m.id}',
        json={'display_name': 'Corrected', 'status': 'suspended'},
        headers=auth(admin_member),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['display_name'] == 'Corrected'
    assert body['status'] == 'suspended'  # enum converted to string


# ------------------------------------------------------------- PUT /members/.../privacy

def test_privacy_requires_auth(client, db_session):
    m = make_member(db_session, status='runner', uid='r1')
    resp = client.put(f'/api/members/{m.id}/privacy?show_in_credits=false')
    assert resp.status_code == 401


def test_privacy_404(client, admin_member):
    resp = client.put('/api/members/999/privacy?show_in_credits=false', headers=auth(admin_member))
    assert resp.status_code == 404


def test_privacy_unknown_caller_403(client, db_session):
    m = make_member(db_session, status='runner', uid='r1')
    resp = client.put(
        f'/api/members/{m.id}/privacy?show_in_credits=false',
        headers={'X-Firebase-UID': 'nobody'},
    )
    assert resp.status_code == 403


def test_privacy_other_member_403(client, db_session, regular_member):
    m = make_member(db_session, status='runner', uid='r1')
    resp = client.put(f'/api/members/{m.id}/privacy?show_in_credits=false', headers=auth(regular_member))
    assert resp.status_code == 403


def test_privacy_self_update(client, db_session):
    m = make_member(db_session, status='runner', uid='r1')
    resp = client.put(
        f'/api/members/{m.id}/privacy?show_in_credits=false&show_in_donors=false',
        headers=auth(m),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['show_in_credits'] is False
    assert body['show_in_donors'] is False


def test_privacy_admin_can_update_others(client, db_session, admin_member):
    m = make_member(db_session, status='runner', uid='r1')
    resp = client.put(f'/api/members/{m.id}/privacy?show_in_donors=false', headers=auth(admin_member))
    assert resp.status_code == 200
    assert resp.json()['show_in_donors'] is False
    assert resp.json()['show_in_credits'] is True  # untouched


# ---------------------------------------------------------------- DELETE /api/members

def test_delete_member_requires_auth(client, db_session):
    m = make_member(db_session, status='runner', uid='r1')
    assert client.delete(f'/api/members/{m.id}').status_code == 401


def test_delete_member_regular_forbidden(client, db_session, regular_member):
    m = make_member(db_session, status='runner', uid='r1')
    assert client.delete(f'/api/members/{m.id}', headers=auth(regular_member)).status_code == 403


def test_delete_member_404(client, admin_member):
    assert client.delete('/api/members/999', headers=auth(admin_member)).status_code == 404


def test_delete_member(client, db_session, admin_member):
    m = make_member(db_session, status='runner', uid='r1')
    resp = client.delete(f'/api/members/{m.id}', headers=auth(admin_member))
    assert resp.status_code == 200
    assert client.get(f'/api/members/{m.id}').status_code == 404


# -------------------------------------------------------------- committee list routes

def test_committee_list(client, db_session, admin_member, committee_member):
    make_member(db_session, status='runner', uid='r1')
    resp = client.get('/api/members/committee/list')
    assert resp.status_code == 200
    assert {m['status'] for m in resp.json()} == {'admin', 'committee'}


def test_committee_all(client, db_session, admin_member, committee_member):
    make_member(db_session, status='runner', uid='r1')
    resp = client.get('/api/members/committee/all')
    assert resp.status_code == 200
    assert len(resp.json()) == 2


# ------------------------------------------------------------------ firebase-sync

def test_firebase_sync_creates_pending_member(client):
    resp = client.post('/api/members/firebase-sync', json={
        'firebase_uid': 'fb-new',
        'email': 'newrunner@test.local',
        'display_name': 'New Runner',
        'photo_url': 'http://img/x.png',
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body['status'] == 'pending'
    assert body['username'] == 'newrunner'
    assert body['profile_photo_url'] == 'http://img/x.png'


def test_firebase_sync_username_collision_appends_counter(client, db_session):
    make_member(db_session, status='runner', uid='r1', username='jane')
    resp = client.post('/api/members/firebase-sync', json={
        'firebase_uid': 'fb-jane', 'email': 'jane@test.local',
    })
    assert resp.json()['username'] == 'jane1'


def test_firebase_sync_existing_uid_updates_profile(client, db_session):
    m = make_member(db_session, status='runner', uid='fb-1', display_name='Old Name')
    resp = client.post('/api/members/firebase-sync', json={
        'firebase_uid': 'fb-1',
        'email': m.email,
        'display_name': 'Fresh Name',
        'photo_url': 'http://img/new.png',
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body['id'] == m.id
    assert body['display_name'] == 'Fresh Name'
    assert body['profile_photo_url'] == 'http://img/new.png'


def test_firebase_sync_existing_uid_blocked(client, db_session):
    make_member(db_session, status='rejected', uid='fb-bad')
    resp = client.post('/api/members/firebase-sync', json={
        'firebase_uid': 'fb-bad', 'email': 'whatever@test.local',
    })
    assert resp.status_code == 403
    assert 'rejected' in resp.json()['detail']


def test_firebase_sync_links_existing_email(client, db_session):
    m = make_member(db_session, status='runner', uid='old-uid', email='link@test.local')
    resp = client.post('/api/members/firebase-sync', json={
        'firebase_uid': 'brand-new-uid',
        'email': 'link@test.local',
        'display_name': 'Linked Name',
        'photo_url': 'http://img/l.png',
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body['id'] == m.id
    assert body['firebase_uid'] == 'brand-new-uid'
    assert body['display_name'] == 'Linked Name'
    assert body['profile_photo_url'] == 'http://img/l.png'


def test_firebase_sync_existing_email_blocked(client, db_session):
    make_member(db_session, status='suspended', uid='old-uid', email='susp@test.local')
    resp = client.post('/api/members/firebase-sync', json={
        'firebase_uid': 'another-uid', 'email': 'susp@test.local',
    })
    assert resp.status_code == 403
    assert 'suspended' in resp.json()['detail']


# ---------------------------------------------------------- GET /members/firebase/{uid}

def test_get_member_by_firebase_uid(client, db_session):
    m = make_member(db_session, status='runner', uid='fb-1')
    resp = client.get('/api/members/firebase/fb-1')
    assert resp.status_code == 200
    assert resp.json()['id'] == m.id


def test_get_member_by_firebase_uid_404(client):
    assert client.get('/api/members/firebase/ghost').status_code == 404


def test_get_member_by_firebase_uid_blocked(client, db_session):
    make_member(db_session, status='quit', uid='fb-quit')
    resp = client.get('/api/members/firebase/fb-quit')
    assert resp.status_code == 403
    assert 'no longer active' in resp.json()['detail']


# ------------------------------------------------------------------- pending list

def test_pending_list_requires_auth(client):
    assert client.get('/api/members/pending/list').status_code == 401


def test_pending_list_regular_forbidden(client, regular_member):
    assert client.get('/api/members/pending/list', headers=auth(regular_member)).status_code == 403


def test_pending_list(client, db_session, committee_member):
    make_member(db_session, status='pending', uid='p1')
    make_member(db_session, status='runner', uid='r1')
    resp = client.get('/api/members/pending/list', headers=auth(committee_member))
    assert resp.status_code == 200
    assert [m['status'] for m in resp.json()] == ['pending']


# ----------------------------------------------------------------------- approve

def test_approve_404(client, admin_member):
    assert client.put('/api/members/999/approve', headers=auth(admin_member)).status_code == 404


def test_approve_non_pending_400(client, db_session, admin_member):
    m = make_member(db_session, status='runner', uid='r1')
    resp = client.put(f'/api/members/{m.id}/approve', headers=auth(admin_member))
    assert resp.status_code == 400


def test_approve_success_sends_email(client, db_session, committee_member, email_calls):
    m = make_member(db_session, status='pending', uid='p1')
    resp = client.put(f'/api/members/{m.id}/approve', headers=auth(committee_member))
    assert resp.status_code == 200
    db_session.refresh(m)
    assert m.status == 'runner'
    assert any(c[0] == 'send_approval_notification' for c in email_calls)


def test_approve_survives_email_failure(client, db_session, admin_member, monkeypatch):
    monkeypatch.setattr(email_service.EmailService, 'send_approval_notification', raise_error)
    m = make_member(db_session, status='pending', uid='p1')
    resp = client.put(f'/api/members/{m.id}/approve', headers=auth(admin_member))
    assert resp.status_code == 200
    db_session.refresh(m)
    assert m.status == 'runner'


# ------------------------------------------------------------------------ reject

def test_reject_404(client, admin_member):
    resp = client.put('/api/members/999/reject', json={'rejection_reason': 'x'}, headers=auth(admin_member))
    assert resp.status_code == 404


def test_reject_non_pending_400(client, db_session, admin_member):
    m = make_member(db_session, status='runner', uid='r1')
    resp = client.put(f'/api/members/{m.id}/reject', json={'rejection_reason': 'x'}, headers=auth(admin_member))
    assert resp.status_code == 400


def test_reject_blank_reason_400(client, db_session, admin_member):
    m = make_member(db_session, status='pending', uid='p1')
    resp = client.put(f'/api/members/{m.id}/reject', json={'rejection_reason': '   '}, headers=auth(admin_member))
    assert resp.status_code == 400


def test_reject_missing_reason_422(client, db_session, admin_member):
    m = make_member(db_session, status='pending', uid='p1')
    resp = client.put(f'/api/members/{m.id}/reject', json={}, headers=auth(admin_member))
    assert resp.status_code == 422


def test_reject_success(client, db_session, admin_member, email_calls):
    m = make_member(db_session, status='pending', uid='p1')
    resp = client.put(
        f'/api/members/{m.id}/reject',
        json={'rejection_reason': '  incomplete application  '},
        headers=auth(admin_member),
    )
    assert resp.status_code == 200
    db_session.refresh(m)
    assert m.status == 'rejected'
    assert m.status_reason == 'incomplete application'
    assert m.status_updated_by == admin_member.display_name
    assert any(c[0] == 'send_rejection_notification' for c in email_calls)


def test_reject_survives_email_failure(client, db_session, admin_member, monkeypatch):
    monkeypatch.setattr(email_service.EmailService, 'send_rejection_notification', raise_error)
    m = make_member(db_session, status='pending', uid='p1')
    resp = client.put(f'/api/members/{m.id}/reject', json={'rejection_reason': 'no'}, headers=auth(admin_member))
    assert resp.status_code == 200


# ------------------------------------------------------------------- join/submit

def test_join_submit_creates_pending_member(client, db_session, email_calls):
    resp = client.post('/api/join/submit', json=JOIN_PAYLOAD)
    assert resp.status_code == 200
    body = resp.json()
    assert body['status'] == 'pending'

    from database import Member
    m = db_session.query(Member).filter(Member.id == body['member_id']).first()
    assert m.username == 'albee'
    assert m.display_name == 'Al Bee'
    assert m.nyrr_member_id == 'NYRR123'
    assert m.status == 'pending'
    sent = [c[0] for c in email_calls]
    assert 'send_join_confirmation' in sent
    assert 'send_committee_notification' in sent


def test_join_submit_no_race_experience_default(client, email_calls):
    payload = dict(JOIN_PAYLOAD, race_experience=None)
    resp = client.post('/api/join/submit', json=payload)
    assert resp.status_code == 200
    committee_call = next(c for c in email_calls if c[0] == 'send_committee_notification')
    form_data = committee_call[1][3]
    assert form_data['Race Experience'] == 'No races yet'


def test_join_submit_duplicate_email_400(client, db_session):
    make_member(db_session, status='runner', uid='r1', email=JOIN_PAYLOAD['email'])
    resp = client.post('/api/join/submit', json=JOIN_PAYLOAD)
    assert resp.status_code == 400


def test_join_submit_username_collision(client, db_session):
    make_member(db_session, status='runner', uid='r1', username='albee')
    resp = client.post('/api/join/submit', json=JOIN_PAYLOAD)
    assert resp.status_code == 200

    from database import Member
    m = db_session.query(Member).filter(Member.id == resp.json()['member_id']).first()
    assert m.username == 'albee1'


def test_join_submit_survives_email_failure(client, monkeypatch):
    monkeypatch.setattr(email_service.EmailService, 'send_join_confirmation', raise_error)
    resp = client.post('/api/join/submit', json=JOIN_PAYLOAD)
    assert resp.status_code == 200


# --------------------------------------------- existing-member-account-request

def test_existing_member_account_request(client, email_calls):
    resp = client.post('/api/members/existing-member-account-request',
                       json={'name': 'Old Timer', 'email': 'old@test.local'})
    assert resp.status_code == 200
    assert any(c[0] == 'send_existing_member_account_notification' for c in email_calls)


def test_existing_member_account_request_survives_email_failure(client, monkeypatch):
    monkeypatch.setattr(
        email_service.EmailService, 'send_existing_member_account_notification', raise_error)
    resp = client.post('/api/members/existing-member-account-request',
                       json={'name': 'Old Timer', 'email': 'old@test.local'})
    assert resp.status_code == 200


# -------------------------------------------------------------------- newsletter

def test_newsletter_requires_auth(client):
    resp = client.post('/api/newsletter/send', json={'subject': 's', 'content': 'c'})
    assert resp.status_code == 401


def test_newsletter_regular_forbidden(client, regular_member):
    resp = client.post('/api/newsletter/send', json={'subject': 's', 'content': 'c'},
                       headers=auth(regular_member))
    assert resp.status_code == 403


def test_newsletter_blank_subject_400(client, admin_member):
    resp = client.post('/api/newsletter/send', json={'subject': '   ', 'content': 'c'},
                       headers=auth(admin_member))
    assert resp.status_code == 400


def test_newsletter_blank_content_400(client, admin_member):
    resp = client.post('/api/newsletter/send', json={'subject': 's', 'content': '  '},
                       headers=auth(admin_member))
    assert resp.status_code == 400


def test_newsletter_no_members(client, db_session):
    # Only member is the admin caller, whose email is empty -> excluded by filter
    boss = make_member(db_session, status='admin', uid='boss', email='')
    resp = client.post('/api/newsletter/send', json={'subject': 's', 'content': 'c'},
                       headers=auth(boss))
    assert resp.status_code == 200
    assert resp.json() == {'sent': 0, 'failed': 0, 'message': 'No active members found.'}


def test_newsletter_counts_sent_and_failed(client, db_session, committee_member, monkeypatch):
    make_member(db_session, status='runner', uid='ok', email='ok@test.local')
    make_member(db_session, status='runner', uid='bad', email='bad@test.local')
    make_member(db_session, status='pending', uid='skip', email='skip@test.local')  # excluded

    sent_to = []

    def fake_send(to_email, subject, body_html, body_text=None):
        sent_to.append((to_email, subject))
        if to_email == 'bad@test.local':
            return False
        if to_email == committee_member.email:
            raise RuntimeError('smtp down')
        return True

    monkeypatch.setattr(email_service.EmailService, 'send_email', fake_send)

    resp = client.post(
        '/api/newsletter/send',
        json={'subject': 'Hello\nWorld', 'content': 'Line1\nLine2'},
        headers=auth(committee_member),
    )
    assert resp.status_code == 200
    assert resp.json() == {'sent': 1, 'failed': 2, 'total': 3}
    # Newlines stripped from subject
    assert all('\n' not in subject for _, subject in sent_to)
    assert 'skip@test.local' not in [t for t, _ in sent_to]


# --------------------------------------------------------------- promote / demote

def test_promote_requires_admin(client, committee_member, db_session):
    m = make_member(db_session, status='runner', uid='r1')
    resp = client.put(f'/api/members/{m.id}/promote-to-committee', headers=auth(committee_member))
    assert resp.status_code == 403


def test_promote_404(client, admin_member):
    assert client.put('/api/members/999/promote-to-committee', headers=auth(admin_member)).status_code == 404


def test_promote_wrong_status_400(client, db_session, admin_member):
    m = make_member(db_session, status='committee', uid='c1')
    resp = client.put(f'/api/members/{m.id}/promote-to-committee', headers=auth(admin_member))
    assert resp.status_code == 400


def test_promote_runner(client, db_session, admin_member):
    m = make_member(db_session, status='runner', uid='r1')
    resp = client.put(f'/api/members/{m.id}/promote-to-committee', headers=auth(admin_member))
    assert resp.status_code == 200
    assert resp.json()['new_status'] == 'committee'
    db_session.refresh(m)
    assert m.status == 'committee'


def test_promote_pending(client, db_session, admin_member):
    m = make_member(db_session, status='pending', uid='p1')
    resp = client.put(f'/api/members/{m.id}/promote-to-committee', headers=auth(admin_member))
    assert resp.status_code == 200


def test_demote_404(client, admin_member):
    assert client.put('/api/members/999/demote-from-committee', headers=auth(admin_member)).status_code == 404


def test_demote_non_committee_400(client, db_session, admin_member):
    m = make_member(db_session, status='runner', uid='r1')
    resp = client.put(f'/api/members/{m.id}/demote-from-committee', headers=auth(admin_member))
    assert resp.status_code == 400


def test_demote_committee(client, db_session, admin_member, committee_member):
    resp = client.put(f'/api/members/{committee_member.id}/demote-from-committee',
                      headers=auth(admin_member))
    assert resp.status_code == 200
    assert resp.json()['new_status'] == 'runner'
    db_session.refresh(committee_member)
    assert committee_member.status == 'runner'
