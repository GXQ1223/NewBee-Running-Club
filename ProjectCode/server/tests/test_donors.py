"""Tests for /api/donors (CRUD, public privacy rules, stats summary)."""
from datetime import date

from database import Donor
from tests.conftest import auth, make_member


def donor_payload(donor_id='D001', **overrides):
    payload = {
        'donor_id': donor_id,
        'name': f'Donor {donor_id}',
        'donor_type': 'individual',
        'donation_event': 'General Support',
        'amount': '100.00',
        'donation_date': '2024-01-15',
    }
    payload.update(overrides)
    return payload


def seed_donor(db_session, donor_id='D001', **overrides):
    defaults = dict(
        donor_id=donor_id,
        name=f'Donor {donor_id}',
        donor_type='individual',
        donation_event='General Support',
        amount=100,
        donation_date=date(2024, 1, 15),
    )
    defaults.update(overrides)
    donor = Donor(**defaults)
    db_session.add(donor)
    db_session.commit()
    db_session.refresh(donor)
    return donor


# ---------------------------------------------------------------- create

def test_create_requires_auth(client):
    assert client.post('/api/donors', json=donor_payload()).status_code == 401


def test_create_rejects_regular_member(client, regular_member):
    resp = client.post('/api/donors', json=donor_payload(), headers=auth(regular_member))
    assert resp.status_code == 403


def test_committee_can_create_donor(client, committee_member):
    resp = client.post('/api/donors', json=donor_payload(), headers=auth(committee_member))
    assert resp.status_code == 200
    body = resp.json()
    assert body['donor_id'] == 'D001'
    assert body['donor_type'] == 'individual'
    assert float(body['amount']) == 100.0
    assert body['donation_id'] > 0


def test_create_duplicate_donor_id_400(client, admin_member):
    client.post('/api/donors', json=donor_payload(), headers=auth(admin_member))
    resp = client.post('/api/donors', json=donor_payload(), headers=auth(admin_member))
    assert resp.status_code == 400


def test_create_validation_errors(client, admin_member):
    # Non-positive amount
    resp = client.post('/api/donors', json=donor_payload(amount='0'),
                       headers=auth(admin_member))
    assert resp.status_code == 422
    # Invalid donor_type enum
    resp = client.post('/api/donors', json=donor_payload(donor_type='corporate'),
                       headers=auth(admin_member))
    assert resp.status_code == 422


# ---------------------------------------------------------------- list all

def test_get_all_donors_split_by_type_and_sorted(client, db_session):
    seed_donor(db_session, 'I1', donation_date=date(2023, 1, 1))
    seed_donor(db_session, 'I2', donation_date=date(2024, 6, 1))
    seed_donor(db_session, 'E1', donor_type='enterprise')

    body = client.get('/api/donors').json()
    assert [d['donor_id'] for d in body['individual_donors']] == ['I2', 'I1']
    assert [d['donor_id'] for d in body['enterprise_donors']] == ['E1']


def test_get_all_donors_excludes_anonymous_individuals(client, db_session):
    seed_donor(db_session, 'I1', notes='Anonymous Donor')
    seed_donor(db_session, 'I2', notes='regular note')
    seed_donor(db_session, 'I3', notes=None)  # no notes must still be listed

    body = client.get('/api/donors').json()
    assert sorted(d['donor_id'] for d in body['individual_donors']) == ['I2', 'I3']


# ---------------------------------------------------------------- by type / by id

def test_get_donors_by_type(client, db_session):
    seed_donor(db_session, 'I1')
    seed_donor(db_session, 'E1', donor_type='enterprise')

    individual = client.get('/api/donors/individual').json()
    enterprise = client.get('/api/donors/enterprise').json()
    assert [d['donor_id'] for d in individual] == ['I1']
    assert [d['donor_id'] for d in enterprise] == ['E1']


def test_get_donors_invalid_type_400(client):
    assert client.get('/api/donors/corporate').status_code == 400


def test_get_donor_by_id(client, db_session):
    seed_donor(db_session, 'D42')
    resp = client.get('/api/donors/id/D42')
    assert resp.status_code == 200
    assert resp.json()['donor_id'] == 'D42'


def test_get_donor_by_id_404(client):
    assert client.get('/api/donors/id/missing').status_code == 404


# ---------------------------------------------------------------- update / delete

def test_update_donor(client, db_session, admin_member):
    seed_donor(db_session, 'D1', amount=100)
    resp = client.put('/api/donors/D1', json={'amount': '250.50', 'name': 'New Name'},
                      headers=auth(admin_member))
    assert resp.status_code == 200
    body = resp.json()
    assert float(body['amount']) == 250.50
    assert body['name'] == 'New Name'
    assert body['donor_type'] == 'individual'  # untouched


def test_update_donor_404(client, admin_member):
    resp = client.put('/api/donors/missing', json={'name': 'x'}, headers=auth(admin_member))
    assert resp.status_code == 404


def test_update_requires_auth(client, db_session):
    seed_donor(db_session, 'D1')
    assert client.put('/api/donors/D1', json={'name': 'x'}).status_code == 401


def test_delete_donor(client, db_session, committee_member):
    seed_donor(db_session, 'D1')
    resp = client.delete('/api/donors/D1', headers=auth(committee_member))
    assert resp.status_code == 200
    assert client.get('/api/donors/id/D1').status_code == 404


def test_delete_donor_404(client, admin_member):
    assert client.delete('/api/donors/missing', headers=auth(admin_member)).status_code == 404


def test_delete_rejects_regular_member(client, db_session, regular_member):
    seed_donor(db_session, 'D1')
    assert client.delete('/api/donors/D1', headers=auth(regular_member)).status_code == 403


# ---------------------------------------------------------------- stats summary

def test_stats_summary_math(client, db_session):
    seed_donor(db_session, 'I1', amount=100)
    seed_donor(db_session, 'I2', amount=200)
    seed_donor(db_session, 'E1', donor_type='enterprise', amount=1000)

    summary = {row['donor_type']: row for row in client.get('/api/donors/stats/summary').json()}
    ind = summary['individual']
    assert ind['donor_count'] == 2
    assert float(ind['total_amount']) == 300.0
    assert float(ind['average_amount']) == 150.0
    assert float(ind['min_amount']) == 100.0
    assert float(ind['max_amount']) == 200.0
    ent = summary['enterprise']
    assert ent['donor_count'] == 1
    assert float(ent['total_amount']) == 1000.0


def test_stats_summary_empty(client):
    assert client.get('/api/donors/stats/summary').json() == []


# ---------------------------------------------------------------- public donors

def test_public_donors_privacy_rules(client, db_session):
    seed_donor(db_session, 'I1', amount=50)  # individual: amount hidden
    seed_donor(db_session, 'E1', donor_type='enterprise', amount=500, message='Go NewBee!')
    seed_donor(db_session, 'E2', donor_type='enterprise', amount=700, hide_amount=True)
    seed_donor(db_session, 'A1', notes='Anonymous Donor')  # excluded
    seed_donor(db_session, 'N1', notes=None)  # no notes still shown
    seed_donor(db_session, 'H1', hide_name=True, message='secret')

    donors = {d['donor_id']: d for d in client.get('/api/donors/public').json()}
    assert 'A1' not in donors
    assert 'N1' in donors
    assert donors['I1']['amount'] is None
    assert float(donors['E1']['amount']) == 500.0
    assert donors['E1']['message'] == 'Go NewBee!'
    assert donors['E2']['amount'] is None  # enterprise opted out of amount display
    assert donors['H1']['name'] == 'Anonymous Donor'
    assert donors['H1']['message'] is None


def test_public_donors_respects_member_opt_out(client, db_session):
    opted_out = make_member(db_session, uid='out-uid', show_in_donors=False)
    opted_in = make_member(db_session, uid='in-uid', show_in_donors=True)
    seed_donor(db_session, 'OUT', member_id=opted_out.id)
    seed_donor(db_session, 'IN', member_id=opted_in.id)

    ids = [d['donor_id'] for d in client.get('/api/donors/public').json()]
    assert 'OUT' not in ids
    assert 'IN' in ids


def test_public_donors_global_hide_amounts(client, db_session, admin_member):
    seed_donor(db_session, 'E1', donor_type='enterprise', amount=500)
    # Turn the global setting on
    resp = client.put('/api/donors/hide-amounts', headers=auth(admin_member))
    assert resp.json() == {'hide_amounts': True}

    donors = client.get('/api/donors/public').json()
    assert all(d['amount'] is None for d in donors)


# ---------------------------------------------------------------- hide-amounts toggle

def test_hide_amounts_defaults_false(client):
    assert client.get('/api/donors/hide-amounts').json() == {'hide_amounts': False}


def test_hide_amounts_toggle_cycle(client, admin_member):
    assert client.put('/api/donors/hide-amounts',
                      headers=auth(admin_member)).json() == {'hide_amounts': True}
    assert client.get('/api/donors/hide-amounts').json() == {'hide_amounts': True}
    assert client.put('/api/donors/hide-amounts',
                      headers=auth(admin_member)).json() == {'hide_amounts': False}
    assert client.get('/api/donors/hide-amounts').json() == {'hide_amounts': False}


def test_hide_amounts_toggle_requires_auth(client):
    assert client.put('/api/donors/hide-amounts').status_code == 401


# ---------------------------------------------------------------- link member

def test_link_member_admin_only(client, db_session, committee_member, regular_member):
    seed_donor(db_session, 'D1')
    resp = client.put('/api/donors/D1/link-member', json={'member_id': regular_member.id},
                      headers=auth(committee_member))
    assert resp.status_code == 403


def test_link_member_success(client, db_session, admin_member, regular_member):
    seed_donor(db_session, 'D1')
    resp = client.put('/api/donors/D1/link-member', json={'member_id': regular_member.id},
                      headers=auth(admin_member))
    assert resp.status_code == 200
    assert resp.json()['member_id'] == regular_member.id
    assert client.get('/api/donors/id/D1').json()['member_id'] == regular_member.id


def test_link_member_donor_404(client, admin_member, regular_member):
    resp = client.put('/api/donors/missing/link-member',
                      json={'member_id': regular_member.id}, headers=auth(admin_member))
    assert resp.status_code == 404


def test_link_member_member_404(client, db_session, admin_member):
    seed_donor(db_session, 'D1')
    resp = client.put('/api/donors/D1/link-member', json={'member_id': 9999},
                      headers=auth(admin_member))
    assert resp.status_code == 404
