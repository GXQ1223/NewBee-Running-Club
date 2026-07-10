"""Tests for /api/training-tips (submission, moderation, upvotes)."""
from database import TrainingTip, TrainingTipUpvote
from tests.conftest import auth


TIP_PAYLOAD = {
    'category': 'recovery',
    'title': 'Sleep more',
    'content': 'Sleep is the best recovery tool.',
}


def seed_tip(db_session, status='approved', **overrides):
    defaults = dict(
        category='recovery',
        title='Seeded tip',
        content='Some advice.',
        status=status,
        upvotes=0,
    )
    defaults.update(overrides)
    tip = TrainingTip(**defaults)
    db_session.add(tip)
    db_session.commit()
    db_session.refresh(tip)
    return tip


# ---------------------------------------------------------------- public list

def test_list_empty(client):
    resp = client.get('/api/training-tips')
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_only_approved(client, db_session):
    seed_tip(db_session, status='approved', title='Visible')
    seed_tip(db_session, status='pending', title='Hidden pending')
    seed_tip(db_session, status='rejected', title='Hidden rejected')

    tips = client.get('/api/training-tips').json()
    assert [t['title'] for t in tips] == ['Visible']


def test_list_category_filter(client, db_session):
    seed_tip(db_session, category='recovery', title='Rec tip')
    seed_tip(db_session, category='gear', title='Gear tip')

    tips = client.get('/api/training-tips?category=gear').json()
    assert [t['title'] for t in tips] == ['Gear tip']


def test_list_sorted_by_upvotes_desc(client, db_session):
    seed_tip(db_session, title='Low', upvotes=1)
    seed_tip(db_session, title='High', upvotes=10)
    seed_tip(db_session, title='Mid', upvotes=5)

    tips = client.get('/api/training-tips').json()
    assert [t['title'] for t in tips] == ['High', 'Mid', 'Low']


def test_list_marks_member_upvotes(client, db_session, regular_member):
    upvoted = seed_tip(db_session, title='Upvoted', upvotes=1)
    seed_tip(db_session, title='Not upvoted')
    db_session.add(TrainingTipUpvote(tip_id=upvoted.id, member_id=regular_member.id))
    db_session.commit()

    tips = {t['title']: t for t in
            client.get('/api/training-tips', headers=auth(regular_member)).json()}
    assert tips['Upvoted']['user_upvoted'] is True
    assert tips['Not upvoted']['user_upvoted'] is False


def test_list_marks_anonymous_upvotes(client, db_session):
    upvoted = seed_tip(db_session, title='Anon upvoted', upvotes=1)
    db_session.add(TrainingTipUpvote(tip_id=upvoted.id, anonymous_id='anon-123'))
    db_session.commit()

    tips = client.get('/api/training-tips?anonymous_id=anon-123').json()
    assert tips[0]['user_upvoted'] is True
    tips = client.get('/api/training-tips?anonymous_id=other').json()
    assert tips[0]['user_upvoted'] is False


# ---------------------------------------------------------------- admin list

def test_admin_list_includes_all_statuses(client, db_session, admin_member):
    seed_tip(db_session, status='approved')
    seed_tip(db_session, status='pending')
    seed_tip(db_session, status='rejected')

    resp = client.get('/api/training-tips/all', headers=auth(admin_member))
    assert resp.status_code == 200
    assert {t['status'] for t in resp.json()} == {'approved', 'pending', 'rejected'}


def test_admin_list_requires_admin(client, regular_member):
    assert client.get('/api/training-tips/all').status_code == 401
    assert client.get('/api/training-tips/all',
                      headers=auth(regular_member)).status_code == 403


# ---------------------------------------------------------------- submit

def test_anonymous_can_submit_tip_as_pending(client, db_session):
    resp = client.post('/api/training-tips', json=TIP_PAYLOAD)
    assert resp.status_code == 200
    body = resp.json()
    assert body['status'] == 'pending'
    assert body['author_id'] is None
    assert body['author_name'] is None
    # Pending tips are not publicly listed
    assert client.get('/api/training-tips').json() == []


def test_member_submission_sets_author(client, regular_member):
    resp = client.post('/api/training-tips', json=TIP_PAYLOAD, headers=auth(regular_member))
    body = resp.json()
    assert body['author_id'] == regular_member.id
    assert body['author_name'] == regular_member.display_name


def test_submit_invalid_category_422(client):
    resp = client.post('/api/training-tips', json=dict(TIP_PAYLOAD, category='bogus'))
    assert resp.status_code == 422


# ---------------------------------------------------------------- update

def test_update_tip(client, db_session, admin_member):
    tip = seed_tip(db_session, status='pending')
    resp = client.put(f'/api/training-tips/{tip.id}',
                      json={'title': 'Edited', 'category': 'mental', 'status': 'approved'},
                      headers=auth(admin_member))
    assert resp.status_code == 200
    body = resp.json()
    assert body['title'] == 'Edited'
    assert body['category'] == 'mental'
    assert body['status'] == 'approved'
    assert body['content'] == tip.content  # untouched


def test_update_tip_404(client, admin_member):
    resp = client.put('/api/training-tips/999', json={'title': 'x'},
                      headers=auth(admin_member))
    assert resp.status_code == 404


def test_update_requires_admin(client, db_session, regular_member):
    tip = seed_tip(db_session)
    resp = client.put(f'/api/training-tips/{tip.id}', json={'title': 'x'},
                      headers=auth(regular_member))
    assert resp.status_code == 403


# ---------------------------------------------------------------- approve / reject

def test_approve_tip(client, db_session, admin_member):
    tip = seed_tip(db_session, status='pending', title='Approve me')
    resp = client.put(f'/api/training-tips/{tip.id}/approve', headers=auth(admin_member))
    assert resp.status_code == 200
    assert [t['title'] for t in client.get('/api/training-tips').json()] == ['Approve me']


def test_reject_tip(client, db_session, admin_member):
    tip = seed_tip(db_session, status='pending')
    resp = client.put(f'/api/training-tips/{tip.id}/reject', headers=auth(admin_member))
    assert resp.status_code == 200
    db_session.refresh(tip)
    assert tip.status == 'rejected'


def test_approve_reject_404_and_auth(client, admin_member, regular_member):
    assert client.put('/api/training-tips/999/approve',
                      headers=auth(admin_member)).status_code == 404
    assert client.put('/api/training-tips/999/reject',
                      headers=auth(admin_member)).status_code == 404
    assert client.put('/api/training-tips/999/approve').status_code == 401
    assert client.put('/api/training-tips/999/reject',
                      headers=auth(regular_member)).status_code == 403


# ---------------------------------------------------------------- delete

def test_delete_tip(client, db_session, admin_member):
    tip = seed_tip(db_session)
    resp = client.delete(f'/api/training-tips/{tip.id}', headers=auth(admin_member))
    assert resp.status_code == 200
    assert client.get('/api/training-tips').json() == []


def test_delete_tip_404(client, admin_member):
    assert client.delete('/api/training-tips/999',
                         headers=auth(admin_member)).status_code == 404


def test_delete_requires_admin(client, db_session, committee_member):
    tip = seed_tip(db_session)
    resp = client.delete(f'/api/training-tips/{tip.id}', headers=auth(committee_member))
    assert resp.status_code == 403


# ---------------------------------------------------------------- upvotes

def test_upvote_404(client, regular_member):
    resp = client.post('/api/training-tips/999/upvote', headers=auth(regular_member))
    assert resp.status_code == 404


def test_upvote_unapproved_tip_400(client, db_session, regular_member):
    tip = seed_tip(db_session, status='pending')
    resp = client.post(f'/api/training-tips/{tip.id}/upvote', headers=auth(regular_member))
    assert resp.status_code == 400


def test_upvote_requires_identity(client, db_session):
    tip = seed_tip(db_session)
    resp = client.post(f'/api/training-tips/{tip.id}/upvote')
    assert resp.status_code == 400


def test_member_upvote_toggle(client, db_session, regular_member):
    tip = seed_tip(db_session)

    resp = client.post(f'/api/training-tips/{tip.id}/upvote', headers=auth(regular_member))
    assert resp.json() == {'tip_id': tip.id, 'upvotes': 1, 'user_upvoted': True}

    # Toggling again removes the upvote (dedup)
    resp = client.post(f'/api/training-tips/{tip.id}/upvote', headers=auth(regular_member))
    assert resp.json() == {'tip_id': tip.id, 'upvotes': 0, 'user_upvoted': False}
    assert db_session.query(TrainingTipUpvote).count() == 0


def test_anonymous_upvote_toggle(client, db_session):
    tip = seed_tip(db_session)

    resp = client.post(f'/api/training-tips/{tip.id}/upvote?anonymous_id=anon-1')
    assert resp.json()['upvotes'] == 1
    assert resp.json()['user_upvoted'] is True

    resp = client.post(f'/api/training-tips/{tip.id}/upvote?anonymous_id=anon-1')
    assert resp.json()['upvotes'] == 0
    assert resp.json()['user_upvoted'] is False


def test_distinct_voters_accumulate(client, db_session, regular_member, admin_member):
    tip = seed_tip(db_session)

    client.post(f'/api/training-tips/{tip.id}/upvote', headers=auth(regular_member))
    client.post(f'/api/training-tips/{tip.id}/upvote', headers=auth(admin_member))
    resp = client.post(f'/api/training-tips/{tip.id}/upvote?anonymous_id=anon-1')
    assert resp.json()['upvotes'] == 3

    # Member removing their vote does not affect others
    resp = client.post(f'/api/training-tips/{tip.id}/upvote', headers=auth(regular_member))
    assert resp.json()['upvotes'] == 2


def test_upvote_count_never_negative(client, db_session, regular_member):
    tip = seed_tip(db_session, upvotes=0)
    # Stale upvote record with counter already at 0
    db_session.add(TrainingTipUpvote(tip_id=tip.id, member_id=regular_member.id))
    db_session.commit()

    resp = client.post(f'/api/training-tips/{tip.id}/upvote', headers=auth(regular_member))
    assert resp.json()['upvotes'] == 0  # clamped, not -1
