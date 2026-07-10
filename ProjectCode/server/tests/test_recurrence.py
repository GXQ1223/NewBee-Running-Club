"""Tests for routes/recurrence.py (recurrence rules, generation, series management)."""
from datetime import date

from database import Event
from tests.conftest import auth
from tests.helpers_events import make_event, make_rule


RULE_PAYLOAD = {'recurrence_type': 'weekly'}


def generated_dates(resp):
    return [e['date'] for e in resp.json()['events']]


# ---------- GET rule ----------

def test_get_recurrence_event_404(client):
    assert client.get('/api/events/999/recurrence').status_code == 404


def test_get_recurrence_no_rule_404(client, db_session):
    event = make_event(db_session)
    assert client.get(f'/api/events/{event.id}/recurrence').status_code == 404


def test_get_recurrence_success(client, db_session):
    event = make_event(db_session)
    make_rule(db_session, event, recurrence_type='weekly', days_of_week='0,6')
    body = client.get(f'/api/events/{event.id}/recurrence').json()
    assert body['event_id'] == event.id
    assert body['recurrence_type'] == 'weekly'
    assert body['days_of_week'] == '0,6'
    assert body['is_active'] is True


# ---------- POST rule ----------

def test_create_recurrence_requires_admin(client, db_session, committee_member):
    event = make_event(db_session)
    url = f'/api/events/{event.id}/recurrence'
    assert client.post(url, json=RULE_PAYLOAD).status_code == 401
    assert client.post(url, json=RULE_PAYLOAD, headers=auth(committee_member)).status_code == 403


def test_create_recurrence_event_404(client, admin_member):
    resp = client.post('/api/events/999/recurrence', json=RULE_PAYLOAD,
                       headers=auth(admin_member))
    assert resp.status_code == 404


def test_create_recurrence_duplicate_400(client, db_session, admin_member):
    event = make_event(db_session)
    make_rule(db_session, event)
    resp = client.post(f'/api/events/{event.id}/recurrence', json=RULE_PAYLOAD,
                       headers=auth(admin_member))
    assert resp.status_code == 400


def test_create_recurrence_success_marks_event_recurring(client, db_session, admin_member):
    event = make_event(db_session)
    payload = {
        'recurrence_type': 'monthly',
        'day_of_month': 15,
        'end_date': '2026-12-31',
        'max_occurrences': 10,
    }
    resp = client.post(f'/api/events/{event.id}/recurrence', json=payload,
                       headers=auth(admin_member))
    assert resp.status_code == 200
    body = resp.json()
    assert body['recurrence_type'] == 'monthly'
    assert body['day_of_month'] == 15
    assert body['end_date'] == '2026-12-31'
    assert body['max_occurrences'] == 10
    assert body['occurrences_created'] == 0
    db_session.refresh(event)
    assert event.is_recurring is True


def test_create_recurrence_validation(client, db_session, admin_member):
    event = make_event(db_session)
    resp = client.post(f'/api/events/{event.id}/recurrence',
                       json={'recurrence_type': 'hourly'}, headers=auth(admin_member))
    assert resp.status_code == 422


# ---------- PUT rule ----------

def test_update_recurrence_no_rule_404(client, db_session, admin_member):
    event = make_event(db_session)
    resp = client.put(f'/api/events/{event.id}/recurrence', json={'max_occurrences': 5},
                      headers=auth(admin_member))
    assert resp.status_code == 404


def test_update_recurrence_success(client, db_session, admin_member):
    event = make_event(db_session)
    make_rule(db_session, event, recurrence_type='weekly')
    resp = client.put(
        f'/api/events/{event.id}/recurrence',
        json={'recurrence_type': 'biweekly', 'max_occurrences': 3, 'is_active': False},
        headers=auth(admin_member),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['recurrence_type'] == 'biweekly'
    assert body['max_occurrences'] == 3
    assert body['is_active'] is False


def test_update_recurrence_partial_fields_only(client, db_session, admin_member):
    event = make_event(db_session)
    make_rule(db_session, event, recurrence_type='weekly')
    body = client.put(f'/api/events/{event.id}/recurrence', json={'end_date': '2027-01-01'},
                      headers=auth(admin_member)).json()
    assert body['recurrence_type'] == 'weekly'  # unchanged
    assert body['end_date'] == '2027-01-01'


# ---------- DELETE rule ----------

def test_delete_recurrence_event_404(client, admin_member):
    assert client.delete('/api/events/999/recurrence',
                         headers=auth(admin_member)).status_code == 404


def test_delete_recurrence_no_rule_404(client, db_session, admin_member):
    event = make_event(db_session)
    resp = client.delete(f'/api/events/{event.id}/recurrence', headers=auth(admin_member))
    assert resp.status_code == 404


def test_delete_recurrence_success(client, db_session, admin_member):
    event = make_event(db_session, is_recurring=True)
    make_rule(db_session, event)
    resp = client.delete(f'/api/events/{event.id}/recurrence', headers=auth(admin_member))
    assert resp.status_code == 200
    db_session.refresh(event)
    assert event.is_recurring is False
    assert client.get(f'/api/events/{event.id}/recurrence').status_code == 404


# ---------- Generate occurrences ----------

def test_generate_event_404(client, admin_member):
    resp = client.post('/api/events/999/recurrence/generate', headers=auth(admin_member))
    assert resp.status_code == 404


def test_generate_no_active_rule_404(client, db_session, admin_member):
    event = make_event(db_session)
    make_rule(db_session, event, is_active=False)
    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       headers=auth(admin_member))
    assert resp.status_code == 404


def test_generate_max_occurrences_already_reached_400(client, db_session, admin_member):
    event = make_event(db_session)
    make_rule(db_session, event, max_occurrences=2, occurrences_created=2)
    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       headers=auth(admin_member))
    assert resp.status_code == 400


def test_generate_weekly(client, db_session, admin_member):
    event = make_event(db_session, event_date=date(2025, 1, 1), is_recurring=True,
                       heylo_embed='<embed/>', event_type='heylo')
    rule = make_rule(db_session, event, recurrence_type='weekly')

    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       params={'count': 3}, headers=auth(admin_member))
    assert resp.status_code == 200
    assert generated_dates(resp) == ['2025-01-08', '2025-01-15', '2025-01-22']

    db_session.refresh(rule)
    assert rule.occurrences_created == 3
    assert rule.last_generated_date == date(2025, 1, 22)

    children = db_session.query(Event).filter(Event.parent_event_id == event.id).all()
    assert len(children) == 3
    for child in children:
        assert child.status == 'Upcoming'
        assert child.is_recurring is False
        assert child.name == event.name
        assert child.heylo_embed == '<embed/>'


def test_generate_continues_from_last_generated_date(client, db_session, admin_member):
    event = make_event(db_session, event_date=date(2025, 1, 1))
    make_rule(db_session, event, recurrence_type='weekly',
              last_generated_date=date(2025, 2, 5))
    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       headers=auth(admin_member))
    assert generated_dates(resp) == ['2025-02-12']


def test_generate_biweekly(client, db_session, admin_member):
    event = make_event(db_session, event_date=date(2025, 1, 1))
    make_rule(db_session, event, recurrence_type='biweekly')
    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       params={'count': 2}, headers=auth(admin_member))
    assert generated_dates(resp) == ['2025-01-15', '2025-01-29']


def test_generate_monthly_with_day_of_month_clamps_short_months(client, db_session, admin_member):
    event = make_event(db_session, event_date=date(2025, 1, 31))
    make_rule(db_session, event, recurrence_type='monthly', day_of_month=31)
    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       params={'count': 3}, headers=auth(admin_member))
    # Feb clamps to 28, then back to the 31st where possible
    assert generated_dates(resp) == ['2025-02-28', '2025-03-31', '2025-04-30']


def test_generate_monthly_year_rollover(client, db_session, admin_member):
    event = make_event(db_session, event_date=date(2025, 12, 10))
    make_rule(db_session, event, recurrence_type='monthly', day_of_month=10)
    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       headers=auth(admin_member))
    assert generated_dates(resp) == ['2026-01-10']


def test_generate_monthly_without_day_of_month_adds_30_days(client, db_session, admin_member):
    event = make_event(db_session, event_date=date(2025, 1, 1))
    make_rule(db_session, event, recurrence_type='monthly')
    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       headers=auth(admin_member))
    assert generated_dates(resp) == ['2025-01-31']


def test_generate_yearly(client, db_session, admin_member):
    event = make_event(db_session, event_date=date(2025, 3, 5))
    make_rule(db_session, event, recurrence_type='yearly')
    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       params={'count': 2}, headers=auth(admin_member))
    assert generated_dates(resp) == ['2026-03-05', '2027-03-05']


def test_generate_yearly_from_leap_day(client, db_session, admin_member):
    """Feb 29 + 1 year must clamp to Feb 28, not crash."""
    event = make_event(db_session, event_date=date(2024, 2, 29))
    make_rule(db_session, event, recurrence_type='yearly')
    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       headers=auth(admin_member))
    assert resp.status_code == 200
    assert generated_dates(resp) == ['2025-02-28']


def test_generate_custom_with_interval(client, db_session, admin_member):
    event = make_event(db_session, event_date=date(2025, 1, 1))
    make_rule(db_session, event, recurrence_type='custom',
              custom_rule='{"interval_days": 3}')
    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       params={'count': 2}, headers=auth(admin_member))
    assert generated_dates(resp) == ['2025-01-04', '2025-01-07']


def test_generate_custom_missing_interval_defaults_to_week(client, db_session, admin_member):
    event = make_event(db_session, event_date=date(2025, 1, 1))
    make_rule(db_session, event, recurrence_type='custom', custom_rule='{}')
    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       headers=auth(admin_member))
    assert generated_dates(resp) == ['2025-01-08']


def test_generate_custom_invalid_json_falls_back_to_weekly(client, db_session, admin_member):
    event = make_event(db_session, event_date=date(2025, 1, 1))
    make_rule(db_session, event, recurrence_type='custom', custom_rule='not-json')
    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       headers=auth(admin_member))
    assert generated_dates(resp) == ['2025-01-08']


def test_generate_custom_without_rule_falls_back_to_weekly(client, db_session, admin_member):
    event = make_event(db_session, event_date=date(2025, 1, 1))
    make_rule(db_session, event, recurrence_type='custom')
    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       headers=auth(admin_member))
    assert generated_dates(resp) == ['2025-01-08']


def test_generate_stops_at_end_date(client, db_session, admin_member):
    event = make_event(db_session, event_date=date(2025, 1, 1))
    rule = make_rule(db_session, event, recurrence_type='weekly',
                     end_date=date(2025, 1, 10))
    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       params={'count': 5}, headers=auth(admin_member))
    assert generated_dates(resp) == ['2025-01-08']
    db_session.refresh(rule)
    assert rule.occurrences_created == 1
    # last_generated_date must be the last *generated* date, not the overshoot
    assert rule.last_generated_date == date(2025, 1, 8)


def test_generate_end_date_before_first_occurrence(client, db_session, admin_member):
    event = make_event(db_session, event_date=date(2025, 1, 1))
    rule = make_rule(db_session, event, recurrence_type='weekly',
                     end_date=date(2025, 1, 5))
    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       headers=auth(admin_member))
    assert resp.status_code == 200
    assert resp.json()['events'] == []
    db_session.refresh(rule)
    assert rule.occurrences_created == 0
    assert rule.last_generated_date is None


def test_generate_stops_at_max_occurrences(client, db_session, admin_member):
    event = make_event(db_session, event_date=date(2025, 1, 1))
    rule = make_rule(db_session, event, recurrence_type='weekly', max_occurrences=2)
    resp = client.post(f'/api/events/{event.id}/recurrence/generate',
                       params={'count': 5}, headers=auth(admin_member))
    assert generated_dates(resp) == ['2025-01-08', '2025-01-15']
    db_session.refresh(rule)
    assert rule.occurrences_created == 2
    assert rule.last_generated_date == date(2025, 1, 15)


def test_generate_requires_admin(client, db_session, committee_member):
    event = make_event(db_session)
    make_rule(db_session, event)
    url = f'/api/events/{event.id}/recurrence/generate'
    assert client.post(url).status_code == 401
    assert client.post(url, headers=auth(committee_member)).status_code == 403


# ---------- with-recurrence ----------

def test_with_recurrence_event_404(client):
    assert client.get('/api/events/999/with-recurrence').status_code == 404


def test_with_recurrence_no_rule(client, db_session):
    event = make_event(db_session, event_type=None)
    body = client.get(f'/api/events/{event.id}/with-recurrence').json()
    assert body['id'] == event.id
    assert body['recurrence'] is None
    assert body['event_type'] == 'standard'  # None coerced to default
    assert body['is_recurring'] is False


def test_with_recurrence_with_rule(client, db_session):
    event = make_event(db_session, is_recurring=True)
    make_rule(db_session, event, recurrence_type='biweekly')
    body = client.get(f'/api/events/{event.id}/with-recurrence').json()
    assert body['is_recurring'] is True
    assert body['recurrence']['recurrence_type'] == 'biweekly'


# ---------- series ----------

def test_series_event_404(client):
    assert client.get('/api/events/999/series').status_code == 404


def test_series_standalone_event_returns_itself(client, db_session):
    event = make_event(db_session)
    body = client.get(f'/api/events/{event.id}/series').json()
    assert [e['id'] for e in body] == [event.id]


def test_series_from_parent_sorted_desc(client, db_session):
    parent = make_event(db_session, event_date=date(2025, 1, 1), is_recurring=True)
    c1 = make_event(db_session, event_date=date(2025, 1, 8), parent_event_id=parent.id)
    c2 = make_event(db_session, event_date=date(2025, 1, 15), parent_event_id=parent.id)
    body = client.get(f'/api/events/{parent.id}/series').json()
    assert [e['id'] for e in body] == [c2.id, c1.id, parent.id]


def test_series_from_child_resolves_parent(client, db_session):
    parent = make_event(db_session, event_date=date(2025, 1, 1), is_recurring=True)
    child = make_event(db_session, event_date=date(2025, 1, 8), parent_event_id=parent.id)
    body = client.get(f'/api/events/{child.id}/series').json()
    assert {e['id'] for e in body} == {parent.id, child.id}


def test_series_child_with_missing_parent(client, db_session):
    child = make_event(db_session, event_date=date(2025, 1, 8), parent_event_id=987654)
    body = client.get(f'/api/events/{child.id}/series').json()
    assert [e['id'] for e in body] == [child.id]


# ---------- add-to-series ----------

def test_add_to_series_event_404(client, db_session, admin_member):
    parent = make_event(db_session, is_recurring=True)
    resp = client.post(f'/api/events/999/add-to-series/{parent.id}',
                       headers=auth(admin_member))
    assert resp.status_code == 404


def test_add_to_series_parent_404(client, db_session, admin_member):
    event = make_event(db_session)
    resp = client.post(f'/api/events/{event.id}/add-to-series/999',
                       headers=auth(admin_member))
    assert resp.status_code == 404


def test_add_to_series_parent_not_recurring_400(client, db_session, admin_member):
    event = make_event(db_session)
    parent = make_event(db_session, name='Plain')
    resp = client.post(f'/api/events/{event.id}/add-to-series/{parent.id}',
                       headers=auth(admin_member))
    assert resp.status_code == 400


def test_add_to_series_self_400(client, db_session, admin_member):
    event = make_event(db_session, is_recurring=True)
    resp = client.post(f'/api/events/{event.id}/add-to-series/{event.id}',
                       headers=auth(admin_member))
    assert resp.status_code == 400


def test_add_to_series_success(client, db_session, admin_member):
    parent = make_event(db_session, is_recurring=True)
    event = make_event(db_session, name='Joiner', is_recurring=True)
    resp = client.post(f'/api/events/{event.id}/add-to-series/{parent.id}',
                       headers=auth(admin_member))
    assert resp.status_code == 200
    db_session.refresh(event)
    assert event.parent_event_id == parent.id
    assert event.is_recurring is False


def test_add_to_series_requires_admin(client, db_session, committee_member):
    parent = make_event(db_session, is_recurring=True)
    event = make_event(db_session, name='Joiner')
    url = f'/api/events/{event.id}/add-to-series/{parent.id}'
    assert client.post(url).status_code == 401
    assert client.post(url, headers=auth(committee_member)).status_code == 403


# ---------- toggle-series-parent ----------

def test_toggle_series_parent_404(client, admin_member):
    resp = client.post('/api/events/999/toggle-series-parent', headers=auth(admin_member))
    assert resp.status_code == 404


def test_toggle_series_parent_child_400(client, db_session, admin_member):
    parent = make_event(db_session, is_recurring=True)
    child = make_event(db_session, parent_event_id=parent.id)
    resp = client.post(f'/api/events/{child.id}/toggle-series-parent',
                       headers=auth(admin_member))
    assert resp.status_code == 400


def test_toggle_series_parent_on_off(client, db_session, admin_member):
    event = make_event(db_session)
    body = client.post(f'/api/events/{event.id}/toggle-series-parent',
                       headers=auth(admin_member)).json()
    assert body['is_recurring'] is True
    body = client.post(f'/api/events/{event.id}/toggle-series-parent',
                       headers=auth(admin_member)).json()
    assert body['is_recurring'] is False


# ---------- dissolve-series ----------

def test_dissolve_series_not_parent_400(client, db_session, admin_member):
    event = make_event(db_session)  # not recurring
    resp = client.post(f'/api/events/{event.id}/dissolve-series', headers=auth(admin_member))
    assert resp.status_code == 400
    resp = client.post('/api/events/999/dissolve-series', headers=auth(admin_member))
    assert resp.status_code == 400


def test_dissolve_series_unlinks_children(client, db_session, admin_member):
    parent = make_event(db_session, is_recurring=True)
    c1 = make_event(db_session, parent_event_id=parent.id)
    c2 = make_event(db_session, parent_event_id=parent.id)
    resp = client.post(f'/api/events/{parent.id}/dissolve-series', headers=auth(admin_member))
    assert resp.status_code == 200
    assert '2 events unlinked' in resp.json()['message']
    for e in (parent, c1, c2):
        db_session.refresh(e)
    assert parent.is_recurring is False
    assert c1.parent_event_id is None
    assert c2.parent_event_id is None


# ---------- remove-from-series ----------

def test_remove_from_series_not_in_series_400(client, db_session, admin_member):
    event = make_event(db_session)
    resp = client.post(f'/api/events/{event.id}/remove-from-series',
                       headers=auth(admin_member))
    assert resp.status_code == 400
    resp = client.post('/api/events/999/remove-from-series', headers=auth(admin_member))
    assert resp.status_code == 400


def test_remove_from_series_success(client, db_session, admin_member):
    parent = make_event(db_session, is_recurring=True)
    child = make_event(db_session, parent_event_id=parent.id)
    resp = client.post(f'/api/events/{child.id}/remove-from-series',
                       headers=auth(admin_member))
    assert resp.status_code == 200
    db_session.refresh(child)
    assert child.parent_event_id is None
