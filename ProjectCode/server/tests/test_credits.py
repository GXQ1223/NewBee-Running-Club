"""Tests for routes/credits.py — temp club credits CRUD and CSV bulk upload."""
from decimal import Decimal

from database import TempClubCredit
from tests.conftest import auth


def add_credit(db_session, full_name, credit_type='registration', reg='0', checkin='0'):
    credit = TempClubCredit(
        full_name=full_name,
        credit_type=credit_type,
        registration_credits=Decimal(reg),
        checkin_credits=Decimal(checkin),
    )
    db_session.add(credit)
    db_session.commit()
    db_session.refresh(credit)
    return credit


def upload(client, headers, csv_text=None, credit_type='registration', mode='merge', raw=None):
    content = raw if raw is not None else csv_text.encode('utf-8')
    return client.post(
        '/api/credits/bulk-upload',
        files={'file': ('credits.csv', content, 'text/csv')},
        data={'credit_type': credit_type, 'mode': mode},
        headers=headers,
    )


# ------------------------------------------------------------------ GET /api/credits

def test_get_credits_empty(client):
    resp = client.get('/api/credits')
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_credits_sorted_by_total_desc_then_name(client, db_session):
    add_credit(db_session, 'Zed Low', 'total', reg='1', checkin='1')
    add_credit(db_session, 'Amy High', 'total', reg='10', checkin='5')
    add_credit(db_session, 'Bob Low', 'total', reg='2', checkin='0')  # ties with Zed

    resp = client.get('/api/credits')
    names = [c['full_name'] for c in resp.json()]
    assert names == ['Amy High', 'Bob Low', 'Zed Low']


def test_get_credits_filter_by_type(client, db_session):
    add_credit(db_session, 'A', 'registration')
    add_credit(db_session, 'B', 'volunteer')

    resp = client.get('/api/credits?credit_type=volunteer')
    body = resp.json()
    assert len(body) == 1
    assert body[0]['full_name'] == 'B'


def test_get_credits_invalid_type_400(client):
    assert client.get('/api/credits?credit_type=bogus').status_code == 400


# ---------------------------------------------------------- GET /api/credits/member

def test_member_credits_aggregation(client, db_session):
    add_credit(db_session, 'John Doe', 'registration', reg='5', checkin='3')
    add_credit(db_session, 'John Doe', 'volunteer', reg='2', checkin='1')
    add_credit(db_session, 'John Doe', 'activity', reg='1.5', checkin='0.5')
    add_credit(db_session, 'Someone Else', 'registration', reg='99', checkin='99')

    resp = client.get('/api/credits/member/John Doe')
    assert resp.status_code == 200
    assert resp.json() == {
        'registration_credits': 5.0,
        'checkin_credits': 3.0,
        'volunteer_credits': 3.0,   # 2 + 1
        'activity_credits': 2.0,    # 1.5 + 0.5
    }


def test_member_credits_excludes_total_rows(client, db_session):
    """'total' rows duplicate the component types and must not be double counted."""
    add_credit(db_session, 'John Doe', 'registration', reg='5', checkin='3')
    add_credit(db_session, 'John Doe', 'volunteer', reg='2', checkin='1')
    add_credit(db_session, 'John Doe', 'total', reg='7', checkin='4')  # auto-recalculated sum

    resp = client.get('/api/credits/member/John Doe')
    assert resp.json() == {
        'registration_credits': 5.0,
        'checkin_credits': 3.0,
        'volunteer_credits': 3.0,
        'activity_credits': 0,
    }


def test_member_credits_case_insensitive_match(client, db_session):
    add_credit(db_session, 'John Doe', 'registration', reg='4', checkin='0')
    resp = client.get('/api/credits/member/john doe')
    assert resp.json()['registration_credits'] == 4.0


def test_member_credits_no_match_returns_zeros(client):
    resp = client.get('/api/credits/member/Nobody')
    assert resp.json() == {
        'registration_credits': 0,
        'checkin_credits': 0,
        'volunteer_credits': 0,
        'activity_credits': 0,
    }


# ------------------------------------------------------------- GET /api/credits/{id}

def test_get_credit_by_id(client, db_session):
    credit = add_credit(db_session, 'A', 'registration', reg='1')
    resp = client.get(f'/api/credits/{credit.id}')
    assert resp.status_code == 200
    assert resp.json()['full_name'] == 'A'


def test_get_credit_by_id_404(client):
    assert client.get('/api/credits/999').status_code == 404


# ----------------------------------------------------------------- POST /api/credits

def test_create_credit_requires_auth(client):
    resp = client.post('/api/credits', json={'full_name': 'A', 'credit_type': 'registration'})
    assert resp.status_code == 401


def test_create_credit_regular_forbidden(client, regular_member):
    resp = client.post('/api/credits', json={'full_name': 'A', 'credit_type': 'registration'},
                       headers=auth(regular_member))
    assert resp.status_code == 403


def test_create_credit_committee_forbidden(client, committee_member):
    """Create is admin-only (not committee)."""
    resp = client.post('/api/credits', json={'full_name': 'A', 'credit_type': 'registration'},
                       headers=auth(committee_member))
    assert resp.status_code == 403


def test_create_credit(client, admin_member):
    resp = client.post(
        '/api/credits',
        json={'full_name': 'A', 'credit_type': 'volunteer',
              'registration_credits': '10.50', 'checkin_credits': '2'},
        headers=auth(admin_member),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['credit_type'] == 'volunteer'
    assert float(body['registration_credits']) == 10.5


def test_create_credit_invalid_type_422(client, admin_member):
    resp = client.post('/api/credits', json={'full_name': 'A', 'credit_type': 'bogus'},
                       headers=auth(admin_member))
    assert resp.status_code == 422


# ------------------------------------------------------------------ PUT /api/credits

def test_update_credit_404(client, admin_member):
    resp = client.put('/api/credits/999', json={'full_name': 'X'}, headers=auth(admin_member))
    assert resp.status_code == 404


def test_update_credit_requires_admin(client, db_session, committee_member):
    credit = add_credit(db_session, 'A')
    resp = client.put(f'/api/credits/{credit.id}', json={'full_name': 'X'},
                      headers=auth(committee_member))
    assert resp.status_code == 403


def test_update_credit(client, db_session, admin_member):
    credit = add_credit(db_session, 'A', 'registration', reg='1', checkin='1')
    resp = client.put(
        f'/api/credits/{credit.id}',
        json={'full_name': 'Renamed', 'credit_type': 'activity', 'registration_credits': '7'},
        headers=auth(admin_member),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['full_name'] == 'Renamed'
    assert body['credit_type'] == 'activity'
    assert float(body['registration_credits']) == 7.0
    assert float(body['checkin_credits']) == 1.0  # untouched


# --------------------------------------------------------------- DELETE /api/credits

def test_delete_credit_404(client, admin_member):
    assert client.delete('/api/credits/999', headers=auth(admin_member)).status_code == 404


def test_delete_credit_requires_admin(client, db_session, regular_member):
    credit = add_credit(db_session, 'A')
    assert client.delete(f'/api/credits/{credit.id}', headers=auth(regular_member)).status_code == 403


def test_delete_credit(client, db_session, admin_member):
    credit = add_credit(db_session, 'A')
    resp = client.delete(f'/api/credits/{credit.id}', headers=auth(admin_member))
    assert resp.status_code == 200
    assert client.get(f'/api/credits/{credit.id}').status_code == 404


# ------------------------------------------------------------------- bulk upload

CSV_BASIC = 'fullName,registration_sum,checkin_sum\nAlice,10,5\nBob,3,2\n'


def test_bulk_upload_requires_auth(client):
    resp = upload(client, {}, CSV_BASIC)
    assert resp.status_code == 401


def test_bulk_upload_regular_forbidden(client, regular_member):
    resp = upload(client, auth(regular_member), CSV_BASIC)
    assert resp.status_code == 403


def test_bulk_upload_invalid_credit_type(client, admin_member):
    resp = upload(client, auth(admin_member), CSV_BASIC, credit_type='bogus')
    assert resp.status_code == 400


def test_bulk_upload_invalid_mode(client, admin_member):
    resp = upload(client, auth(admin_member), CSV_BASIC, mode='bogus')
    assert resp.status_code == 400


def test_bulk_upload_empty_csv(client, admin_member):
    resp = upload(client, auth(admin_member), 'fullName,registration_sum,checkin_sum\n')
    assert resp.status_code == 400
    assert 'empty' in resp.json()['detail']


def test_bulk_upload_missing_column(client, admin_member):
    resp = upload(client, auth(admin_member), 'fullName,registration_sum\nAlice,10\n')
    assert resp.status_code == 400
    assert 'checkin_sum' in resp.json()['detail']


def test_bulk_upload_merge_adds_and_recalculates_totals(client, db_session, committee_member):
    resp = upload(client, auth(committee_member), CSV_BASIC, credit_type='registration')
    assert resp.status_code == 200
    body = resp.json()
    assert body['rows_processed'] == 2
    assert body['rows_added'] == 2
    assert body['rows_updated'] == 0
    assert body['totals_recalculated'] == 2
    assert body['total_errors'] == 0

    totals = {c.full_name: c for c in db_session.query(TempClubCredit).filter(
        TempClubCredit.credit_type == 'total').all()}
    assert float(totals['Alice'].registration_credits) == 10.0
    assert float(totals['Alice'].checkin_credits) == 5.0


def test_bulk_upload_merge_updates_existing(client, admin_member):
    upload(client, auth(admin_member), CSV_BASIC, credit_type='registration')
    resp = upload(client, auth(admin_member),
                  'fullName,registration_sum,checkin_sum\nAlice,20,0\n',
                  credit_type='registration')
    body = resp.json()
    assert body['rows_updated'] == 1
    assert body['rows_added'] == 0
    assert body['totals_recalculated'] == 2  # Alice + Bob totals refreshed

    member = client.get('/api/credits/member/Alice').json()
    assert member['registration_credits'] == 20.0
    assert member['checkin_credits'] == 0.0


def test_bulk_upload_totals_sum_across_types(client, admin_member):
    upload(client, auth(admin_member),
           'fullName,registration_sum,checkin_sum\nAlice,10,5\n', credit_type='registration')
    upload(client, auth(admin_member),
           'fullName,registration_sum,checkin_sum\nAlice,2,1\n', credit_type='volunteer')

    totals = client.get('/api/credits?credit_type=total').json()
    assert len(totals) == 1
    assert float(totals[0]['registration_credits']) == 12.0
    assert float(totals[0]['checkin_credits']) == 6.0


def test_bulk_upload_replace_deletes_existing_and_stale_totals(client, db_session, admin_member):
    upload(client, auth(admin_member), CSV_BASIC, credit_type='registration')
    # Replace with a CSV that no longer contains Bob
    resp = upload(client, auth(admin_member),
                  'fullName,registration_sum,checkin_sum\nAlice,7,7\n',
                  credit_type='registration', mode='replace')
    assert resp.status_code == 200

    reg_names = [c['full_name'] for c in client.get('/api/credits?credit_type=registration').json()]
    assert reg_names == ['Alice']
    total_names = [c['full_name'] for c in client.get('/api/credits?credit_type=total').json()]
    assert total_names == ['Alice']  # Bob's stale total removed


def test_bulk_upload_total_type_skips_recalculation(client, admin_member):
    resp = upload(client, auth(admin_member), CSV_BASIC, credit_type='total')
    body = resp.json()
    assert body['rows_added'] == 2
    assert body['totals_recalculated'] == 0

    totals = client.get('/api/credits?credit_type=total').json()
    assert len(totals) == 2


def test_bulk_upload_row_errors(client, admin_member):
    csv_text = (
        'fullName,registration_sum,checkin_sum\n'
        ',10,5\n'            # empty name
        'BadReg,abc,5\n'     # invalid registration_sum
        'BadCheck,1,xyz\n'   # invalid checkin_sum
        'Good,1,\n'          # blank checkin -> treated as 0
    )
    resp = upload(client, auth(admin_member), csv_text, credit_type='registration')
    body = resp.json()
    assert body['rows_processed'] == 1
    assert body['rows_added'] == 1
    assert body['total_errors'] == 3
    assert any('Empty name' in e for e in body['errors'])
    assert any('registration_sum' in e for e in body['errors'])
    assert any('checkin_sum' in e for e in body['errors'])

    member = client.get('/api/credits/member/Good').json()
    assert member['registration_credits'] == 1.0
    assert member['checkin_credits'] == 0.0


def test_bulk_upload_case_insensitive_headers(client, admin_member):
    csv_text = 'FullName,REGISTRATION_SUM,Checkin_Sum\nAlice,1,2\n'
    resp = upload(client, auth(admin_member), csv_text, credit_type='registration')
    assert resp.status_code == 200
    assert resp.json()['rows_added'] == 1


def test_bulk_upload_latin1_fallback(client, admin_member):
    raw = 'fullName,registration_sum,checkin_sum\nJos\xe9,1,2\n'.encode('latin-1')
    resp = upload(client, auth(admin_member), raw=raw, credit_type='registration')
    assert resp.status_code == 200
    assert resp.json()['rows_added'] == 1
    names = [c['full_name'] for c in client.get('/api/credits?credit_type=registration').json()]
    assert names == ['Jos\xe9']
