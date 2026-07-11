"""Tests for routes/race_submissions.py — race record submissions & race photos."""
import pytest

from database import RacePhoto, RaceSubmission, Results
from routes.race_submissions import compute_pace, distance_to_miles
from tests.conftest import auth, make_member


SUBMISSION = {
    'race_name': 'Boston Marathon',
    'race_date': '2026-04-20',
    'race_distance': 'Marathon',
    'finish_time': '3:25:58',
    'proof_url': 'https://results.baa.org/2026/?bib=1234',
    'photo_url': 'https://img.example.com/boston.jpg',
}


@pytest.fixture()
def runner(db_session):
    return make_member(
        db_session, status='runner', uid='runner-1',
        display_name='Wei Chen', gender='M', birth_year=1990,
    )


def submit(client, member, payload=None):
    return client.post('/api/race-submissions', json=payload or SUBMISSION, headers=auth(member))


def make_result(db_session, name='Wei Chen', **overrides):
    from datetime import datetime
    defaults = dict(
        name=name,
        gender_age='M35',
        overall_time='1:38:12',
        pace='07:30',
        race='RBC Brooklyn Half',
        race_time=datetime(2026, 5, 16),
        race_distance='Half Marathon',
    )
    defaults.update(overrides)
    result = Results(**defaults)
    db_session.add(result)
    db_session.commit()
    db_session.refresh(result)
    return result


# ------------------------------------------------------------- helpers

def test_distance_to_miles_known_formats():
    assert distance_to_miles('Marathon') == pytest.approx(26.2188)
    assert distance_to_miles('Half Marathon') == pytest.approx(13.1094)
    assert distance_to_miles('half') is None  # bare "half" is not a known format
    assert distance_to_miles('10K') == pytest.approx(6.2137, abs=1e-3)
    assert distance_to_miles('5 km') == pytest.approx(3.1069, abs=1e-3)
    assert distance_to_miles('10M') == 10.0
    assert distance_to_miles('1 mile') == 1.0
    assert distance_to_miles('3 miles') == 3.0
    assert distance_to_miles('') is None
    assert distance_to_miles(None) is None
    assert distance_to_miles('weird') is None


def test_compute_pace():
    assert compute_pace('3:25:58', 'Marathon') == '07:51'
    assert compute_pace('21:37', '5K') == '06:57'
    assert compute_pace('1:00:00', 'unknown-distance') is None
    assert compute_pace('0:00', '5K') is None  # zero time → no pace


# ------------------------------------------------------------- create

def test_create_submission(client, runner):
    resp = submit(client, runner)
    assert resp.status_code == 200
    body = resp.json()
    assert body['status'] == 'pending'
    assert body['member_id'] == runner.id
    assert body['race_name'] == 'Boston Marathon'
    assert body['pace'] == '07:51'
    assert body['result_id'] is None


def test_create_requires_auth(client):
    resp = client.post('/api/race-submissions', json=SUBMISSION)
    assert resp.status_code == 401


def test_create_rejects_bad_time(client, runner):
    resp = submit(client, runner, dict(SUBMISSION, finish_time='fast!'))
    assert resp.status_code == 400
    assert 'finish time' in resp.json()['detail'].lower()


def test_create_rejects_future_date(client, runner):
    resp = submit(client, runner, dict(SUBMISSION, race_date='2099-01-01'))
    assert resp.status_code == 400
    assert 'future' in resp.json()['detail'].lower()


def test_create_unknown_distance_has_no_pace(client, runner):
    resp = submit(client, runner, dict(SUBMISSION, race_distance='Vertical Mile Challenge'))
    assert resp.status_code == 200
    assert resp.json()['pace'] is None


# ------------------------------------------------------------- mine

def test_mine_lists_own_only_newest_first(client, db_session, runner):
    other = make_member(db_session, status='runner', uid='runner-2')
    submit(client, runner)
    submit(client, other, dict(SUBMISSION, race_name='Chicago Marathon'))
    second = submit(client, runner, dict(SUBMISSION, race_name='Berlin Marathon')).json()

    resp = client.get('/api/race-submissions/mine', headers=auth(runner))
    assert resp.status_code == 200
    names = [s['race_name'] for s in resp.json()]
    assert names == ['Berlin Marathon', 'Boston Marathon']
    assert resp.json()[0]['id'] == second['id']


def test_mine_requires_auth(client):
    assert client.get('/api/race-submissions/mine').status_code == 401


# ------------------------------------------------------------- pending list

def test_pending_list_requires_committee(client, runner):
    submit(client, runner)
    resp = client.get('/api/race-submissions/pending', headers=auth(runner))
    assert resp.status_code == 403


def test_pending_list_includes_member_info(client, committee_member, runner):
    submit(client, runner)
    resp = client.get('/api/race-submissions/pending', headers=auth(committee_member))
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]['member_name'] == 'Wei Chen'
    assert items[0]['member_gender'] == 'M'
    assert items[0]['member_birth_year'] == 1990


def test_pending_list_excludes_reviewed(client, committee_member, runner):
    sid = submit(client, runner).json()['id']
    client.put(f'/api/race-submissions/{sid}/review',
               json={'approved': True}, headers=auth(committee_member))
    resp = client.get('/api/race-submissions/pending', headers=auth(committee_member))
    assert resp.json() == []


# ------------------------------------------------------------- update

def test_member_edits_pending_submission(client, runner):
    sid = submit(client, runner).json()['id']
    resp = client.put(f'/api/race-submissions/{sid}',
                      json={'finish_time': '3:20:00'}, headers=auth(runner))
    assert resp.status_code == 200
    assert resp.json()['finish_time'] == '3:20:00'
    assert resp.json()['pace'] == '07:38'  # pace recomputed


def test_edit_404(client, runner):
    resp = client.put('/api/race-submissions/999', json={}, headers=auth(runner))
    assert resp.status_code == 404


def test_cannot_edit_others_submission(client, db_session, runner):
    other = make_member(db_session, status='runner', uid='runner-2')
    sid = submit(client, runner).json()['id']
    resp = client.put(f'/api/race-submissions/{sid}',
                      json={'finish_time': '2:59:59'}, headers=auth(other))
    assert resp.status_code == 403


def test_edit_validates_time_and_date(client, runner):
    sid = submit(client, runner).json()['id']
    assert client.put(f'/api/race-submissions/{sid}',
                      json={'finish_time': 'nope'}, headers=auth(runner)).status_code == 400
    assert client.put(f'/api/race-submissions/{sid}',
                      json={'race_date': '2099-01-01'}, headers=auth(runner)).status_code == 400


def test_edit_rejected_resubmits(client, committee_member, runner):
    sid = submit(client, runner).json()['id']
    client.put(f'/api/race-submissions/{sid}/review',
               json={'approved': False, 'review_note': 'no proof'},
               headers=auth(committee_member))
    resp = client.put(f'/api/race-submissions/{sid}',
                      json={'proof_url': 'https://proof.example.com'}, headers=auth(runner))
    body = resp.json()
    assert body['status'] == 'pending'
    assert body['review_note'] is None
    assert body['reviewed_by'] is None


def test_photo_change_allowed_after_approval(client, committee_member, runner):
    sid = submit(client, runner).json()['id']
    client.put(f'/api/race-submissions/{sid}/review',
               json={'approved': True}, headers=auth(committee_member))
    resp = client.put(f'/api/race-submissions/{sid}',
                      json={'photo_url': 'https://img.example.com/new.jpg'}, headers=auth(runner))
    assert resp.status_code == 200
    assert resp.json()['photo_url'] == 'https://img.example.com/new.jpg'
    assert resp.json()['status'] == 'approved'  # photo edit does not resubmit


def test_record_fields_locked_after_approval(client, committee_member, runner):
    sid = submit(client, runner).json()['id']
    client.put(f'/api/race-submissions/{sid}/review',
               json={'approved': True}, headers=auth(committee_member))
    resp = client.put(f'/api/race-submissions/{sid}',
                      json={'finish_time': '2:59:59'}, headers=auth(runner))
    assert resp.status_code == 400


# ------------------------------------------------------------- delete

def test_member_withdraws_pending(client, db_session, runner):
    sid = submit(client, runner).json()['id']
    resp = client.delete(f'/api/race-submissions/{sid}', headers=auth(runner))
    assert resp.status_code == 200
    assert db_session.query(RaceSubmission).count() == 0


def test_delete_404(client, runner):
    assert client.delete('/api/race-submissions/999', headers=auth(runner)).status_code == 404


def test_cannot_withdraw_others_submission(client, db_session, runner):
    other = make_member(db_session, status='runner', uid='runner-2')
    sid = submit(client, runner).json()['id']
    assert client.delete(f'/api/race-submissions/{sid}', headers=auth(other)).status_code == 403


def test_committee_can_remove_pending(client, committee_member, runner):
    sid = submit(client, runner).json()['id']
    assert client.delete(f'/api/race-submissions/{sid}',
                         headers=auth(committee_member)).status_code == 200


def test_cannot_withdraw_approved(client, committee_member, runner):
    sid = submit(client, runner).json()['id']
    client.put(f'/api/race-submissions/{sid}/review',
               json={'approved': True}, headers=auth(committee_member))
    assert client.delete(f'/api/race-submissions/{sid}', headers=auth(runner)).status_code == 400


# ------------------------------------------------------------- review

def test_review_requires_committee(client, runner):
    sid = submit(client, runner).json()['id']
    resp = client.put(f'/api/race-submissions/{sid}/review',
                      json={'approved': True}, headers=auth(runner))
    assert resp.status_code == 403


def test_review_404(client, committee_member):
    resp = client.put('/api/race-submissions/999/review',
                      json={'approved': True}, headers=auth(committee_member))
    assert resp.status_code == 404


def test_approve_posts_to_results_and_leaderboard(client, db_session, committee_member, runner):
    sid = submit(client, runner).json()['id']
    resp = client.put(f'/api/race-submissions/{sid}/review',
                      json={'approved': True, 'review_note': 'verified on baa.org'},
                      headers=auth(committee_member))
    assert resp.status_code == 200
    body = resp.json()
    assert body['status'] == 'approved'
    assert body['reviewed_by'] == committee_member.id
    assert body['result_id'] is not None

    result = db_session.query(Results).get(body['result_id'])
    assert result.name == 'Wei Chen'
    assert result.gender_age == 'M36'  # 2026 - 1990
    assert result.overall_time == '3:25:58'
    assert result.race_distance == 'Marathon'

    # visible on the member's profile results
    profile = client.get('/api/results/member/Wei Chen').json()
    assert profile['stats']['total_races'] == 1
    assert profile['stats']['prs']['Marathon']['time'] == '3:25:58'

    # visible on the men's leaderboard
    men = client.get('/api/results/men-records').json()['men_records']
    assert any(r['runner_name'] == 'Wei Chen' and r['time'] == '3:25:58' for r in men)


def test_approve_female_maps_gender_to_w(client, db_session, committee_member):
    runner_f = make_member(db_session, status='runner', uid='runner-f',
                           display_name='Li Na', gender='F', birth_year=1992)
    sid = submit(client, runner_f).json()['id']
    body = client.put(f'/api/race-submissions/{sid}/review',
                      json={'approved': True}, headers=auth(committee_member)).json()
    result = db_session.query(Results).get(body['result_id'])
    assert result.gender_age == 'W34'
    women = client.get('/api/results/women-records').json()['women_records']
    assert any(r['runner_name'] == 'Li Na' for r in women)


def test_approve_without_gender_birthyear_has_no_gender_age(client, db_session, committee_member):
    runner_x = make_member(db_session, status='runner', uid='runner-x',
                           display_name='Mystery Runner', gender=None, birth_year=None)
    sid = submit(client, runner_x).json()['id']
    body = client.put(f'/api/race-submissions/{sid}/review',
                      json={'approved': True}, headers=auth(committee_member)).json()
    result = db_session.query(Results).get(body['result_id'])
    assert result.gender_age is None


def test_reject_requires_note(client, committee_member, runner):
    sid = submit(client, runner).json()['id']
    resp = client.put(f'/api/race-submissions/{sid}/review',
                      json={'approved': False}, headers=auth(committee_member))
    assert resp.status_code == 400


def test_reject_sets_status_and_note(client, db_session, committee_member, runner):
    sid = submit(client, runner).json()['id']
    resp = client.put(f'/api/race-submissions/{sid}/review',
                      json={'approved': False, 'review_note': 'link broken'},
                      headers=auth(committee_member))
    body = resp.json()
    assert body['status'] == 'rejected'
    assert body['review_note'] == 'link broken'
    assert db_session.query(Results).count() == 0


def test_cannot_review_twice(client, committee_member, runner):
    sid = submit(client, runner).json()['id']
    client.put(f'/api/race-submissions/{sid}/review',
               json={'approved': True}, headers=auth(committee_member))
    resp = client.put(f'/api/race-submissions/{sid}/review',
                      json={'approved': True}, headers=auth(committee_member))
    assert resp.status_code == 400


def test_approve_missing_member_404(client, db_session, committee_member, runner):
    sid = submit(client, runner).json()['id']
    db_session.query(RaceSubmission).filter_by(id=sid).update({'member_id': 9999})
    db_session.commit()
    resp = client.put(f'/api/race-submissions/{sid}/review',
                      json={'approved': True}, headers=auth(committee_member))
    assert resp.status_code == 404


# ------------------------------------------------------------- race photos

def test_upsert_race_photo(client, db_session, runner):
    result = make_result(db_session)
    resp = client.put('/api/race-photos',
                      json={'result_id': result.id, 'photo_url': 'https://img/a.jpg'},
                      headers=auth(runner))
    assert resp.status_code == 200
    assert resp.json()['photo_url'] == 'https://img/a.jpg'

    # replace
    resp = client.put('/api/race-photos',
                      json={'result_id': result.id, 'photo_url': 'https://img/b.jpg'},
                      headers=auth(runner))
    assert resp.status_code == 200
    assert resp.json()['photo_url'] == 'https://img/b.jpg'
    assert db_session.query(RacePhoto).count() == 1


def test_race_photo_result_must_exist(client, runner):
    resp = client.put('/api/race-photos',
                      json={'result_id': 999, 'photo_url': 'https://img/a.jpg'},
                      headers=auth(runner))
    assert resp.status_code == 404


def test_race_photo_must_own_result(client, db_session, runner):
    result = make_result(db_session, name='Somebody Else')
    resp = client.put('/api/race-photos',
                      json={'result_id': result.id, 'photo_url': 'https://img/a.jpg'},
                      headers=auth(runner))
    assert resp.status_code == 403


def test_race_photo_matches_nickname(client, db_session):
    member = make_member(db_session, status='runner', uid='nick-uid',
                         display_name=None, nickname='Speedy')
    result = make_result(db_session, name='Speedy')
    resp = client.put('/api/race-photos',
                      json={'result_id': result.id, 'photo_url': 'https://img/a.jpg'},
                      headers=auth(member))
    assert resp.status_code == 200


def test_get_my_race_photos(client, db_session, runner):
    result = make_result(db_session)
    client.put('/api/race-photos',
               json={'result_id': result.id, 'photo_url': 'https://img/a.jpg'},
               headers=auth(runner))
    resp = client.get('/api/race-photos/mine', headers=auth(runner))
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]['result_id'] == result.id


def test_race_photos_require_auth(client):
    assert client.get('/api/race-photos/mine').status_code == 401
    assert client.put('/api/race-photos',
                      json={'result_id': 1, 'photo_url': 'x'}).status_code == 401
