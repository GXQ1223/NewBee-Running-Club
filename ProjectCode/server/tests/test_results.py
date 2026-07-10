"""Tests for /api/results (race results queries + NYRR sync)."""
from datetime import datetime

import pytest

import routes.results as results_module
from database import Results
from tests.conftest import auth


def make_result(db_session, **overrides):
    """Insert a Results row and return it."""
    defaults = dict(
        name='Alice Runner',
        gender_age='W30',
        overall_time='0:50:00',
        pace='08:00',
        race='Test Race 10K',
        race_time=datetime(2024, 6, 1, 8, 0),
        race_distance='10K',
    )
    defaults.update(overrides)
    result = Results(**defaults)
    db_session.add(result)
    db_session.commit()
    db_session.refresh(result)
    return result


# ---------------------------------------------------------------- available-years

def test_available_years_empty(client):
    resp = client.get('/api/results/available-years')
    assert resp.status_code == 200
    assert resp.json() == {'years': []}


def test_available_years_distinct_desc(client, db_session):
    make_result(db_session, race_time=datetime(2022, 5, 1))
    make_result(db_session, race_time=datetime(2024, 5, 1))
    make_result(db_session, race_time=datetime(2024, 9, 1))  # duplicate year
    make_result(db_session, race_time=datetime(2023, 5, 1))

    resp = client.get('/api/results/available-years')
    assert resp.json() == {'years': [2024, 2023, 2022]}


# ---------------------------------------------------------------- men/women records

def test_men_records_filters_gender_and_ranks_by_time(client, db_session):
    make_result(db_session, name='Slow Man', gender_age='M40', overall_time='1:00:00')
    make_result(db_session, name='Fast Man', gender_age='M30', overall_time='0:45:00')
    make_result(db_session, name='A Woman', gender_age='W30', overall_time='0:40:00')

    resp = client.get('/api/results/men-records')
    assert resp.status_code == 200
    records = resp.json()['men_records']
    assert [r['runner_name'] for r in records] == ['Fast Man', 'Slow Man']
    assert records[0]['rank'] == 1
    assert records[1]['rank'] == 2
    assert records[0]['time'] == '0:45:00'
    assert records[0]['distance'] == '10K'
    assert records[0]['race_date'] == '2024-06-01'


def test_men_records_top_10_per_distance(client, db_session):
    for i in range(12):
        make_result(db_session, name=f'M{i}', gender_age='M30',
                    overall_time=f'0:{40 + i}:00')
    make_result(db_session, name='HalfGuy', gender_age='M35',
                race_distance='Half Marathon', overall_time='1:30:00')

    records = client.get('/api/results/men-records').json()['men_records']
    ten_k = [r for r in records if r['distance'] == '10K']
    half = [r for r in records if r['distance'] == 'Half Marathon']
    assert len(ten_k) == 10
    assert ten_k[0]['runner_name'] == 'M0'
    assert ten_k[-1]['runner_name'] == 'M9'
    assert len(half) == 1
    assert half[0]['rank'] == 1


def test_men_records_year_filter(client, db_session):
    make_result(db_session, name='Man 2023', gender_age='M30',
                race_time=datetime(2023, 6, 1))
    make_result(db_session, name='Man 2024', gender_age='M30',
                race_time=datetime(2024, 6, 1))

    records = client.get('/api/results/men-records?year=2023').json()['men_records']
    assert [r['runner_name'] for r in records] == ['Man 2023']


def test_men_records_null_time_sorted_last(client, db_session):
    make_result(db_session, name='No Time', gender_age='M30', overall_time=None)
    make_result(db_session, name='Has Time', gender_age='M30', overall_time='0:50:00')

    records = client.get('/api/results/men-records').json()['men_records']
    assert [r['runner_name'] for r in records] == ['Has Time', 'No Time']


@pytest.mark.parametrize('endpoint', ['men-records', 'women-records'])
@pytest.mark.parametrize('year', [1800, 2200])
def test_records_invalid_year_400(client, endpoint, year):
    resp = client.get(f'/api/results/{endpoint}?year={year}')
    assert resp.status_code == 400


def test_women_records_filters_gender(client, db_session):
    make_result(db_session, name='A Man', gender_age='M30', overall_time='0:40:00')
    make_result(db_session, name='Fast Woman', gender_age='W25', overall_time='0:48:00')
    make_result(db_session, name='Slow Woman', gender_age='W45', overall_time='0:55:00')

    resp = client.get('/api/results/women-records')
    assert resp.status_code == 200
    records = resp.json()['women_records']
    assert [r['runner_name'] for r in records] == ['Fast Woman', 'Slow Woman']
    assert records[0]['rank'] == 1


def test_women_records_year_filter(client, db_session):
    make_result(db_session, name='W 2022', race_time=datetime(2022, 3, 1))
    make_result(db_session, name='W 2024', race_time=datetime(2024, 3, 1))

    records = client.get('/api/results/women-records?year=2024').json()['women_records']
    assert [r['runner_name'] for r in records] == ['W 2024']


# ---------------------------------------------------------------- all-races

def test_all_races_grouped_counts_desc_date(client, db_session):
    make_result(db_session, race='Old Race', race_time=datetime(2023, 1, 1, 8, 0),
                race_distance='5K')
    make_result(db_session, race='New Race', race_time=datetime(2024, 1, 1, 8, 0),
                race_distance='10K', name='Runner 1')
    make_result(db_session, race='New Race', race_time=datetime(2024, 1, 1, 8, 0),
                race_distance='10K', name='Runner 2')

    races = client.get('/api/results/all-races').json()['races']
    assert len(races) == 2
    assert races[0] == {'race_name': 'New Race', 'distance': '10K',
                        'date': '2024-01-01', 'runner_count': 2}
    assert races[1]['race_name'] == 'Old Race'
    assert races[1]['runner_count'] == 1


# ---------------------------------------------------------------- sync race patterns

def test_sync_race_patterns_sorted_by_month(client):
    resp = client.get('/api/results/sync/races')
    assert resp.status_code == 200
    races = resp.json()['races']
    assert len(races) > 0
    months = [r['typical_month'] for r in races]
    assert months == sorted(months)
    for entry in races:
        assert set(entry) == {'code', 'name_template', 'distance', 'typical_month'}


# ---------------------------------------------------------------- NYRR sync (mocked)

def parse_sse(text):
    """Parse SSE body into list of event dicts."""
    import json
    events = []
    for block in text.split('\n\n'):
        block = block.strip()
        if block.startswith('data: '):
            events.append(json.loads(block[len('data: '):]))
    return events


@pytest.fixture()
def sync_env(monkeypatch, db_session):
    """Route the sync endpoint's manual DB access to the test DB and
    stub out all NYRR network/import functions."""
    import fetch_historical_data as fhd

    def fake_get_db():
        yield db_session

    monkeypatch.setattr(results_module, 'get_db', fake_get_db)

    async def fast_sleep(_):
        return None

    monkeypatch.setattr(results_module.asyncio, 'sleep', fast_sleep)

    calls = {'fetched': [], 'imported': []}

    def fake_fetch(event_code, team_code='NBRC'):
        calls['fetched'].append(event_code)
        return [1, 2, 3]  # truthy, len() > 0

    def fake_import(event_code, config, df):
        calls['imported'].append(event_code)
        return len(df)

    monkeypatch.setattr(fhd, 'fetch_race_data', fake_fetch)
    monkeypatch.setattr(fhd, 'import_race_data', fake_import)
    return calls


def test_sync_requires_auth(client, sync_env):
    resp = client.post('/api/results/sync', json={'years': [2024]})
    assert resp.status_code == 401


def test_sync_rejects_regular_member(client, regular_member, sync_env):
    resp = client.post('/api/results/sync', json={'years': [2024]},
                       headers=auth(regular_member))
    assert resp.status_code == 403


def test_sync_rejects_unknown_uid(client, db_session, sync_env):
    resp = client.post('/api/results/sync', json={'years': [2024]},
                       headers={'X-Firebase-UID': 'nobody'})
    assert resp.status_code == 403


def test_sync_success_stream(client, admin_member, sync_env):
    resp = client.post(
        '/api/results/sync',
        json={'years': [2024], 'race_codes': ['BX10M', 'NOT_A_CODE']},
        headers=auth(admin_member),
    )
    assert resp.status_code == 200
    events = parse_sse(resp.text)

    # Unknown code is silently skipped -> only 1 combo
    assert events[0] == {'type': 'start', 'total': 1}
    progress = [e for e in events if e['type'] == 'progress']
    assert progress[0]['status'] == 'fetching'
    assert progress[1]['status'] == 'imported'
    assert progress[1]['count'] == 3
    assert events[-1] == {'type': 'complete', 'total_imported': 3, 'total_errors': 0}
    assert sync_env['fetched'] == sync_env['imported']


def test_sync_no_data_and_error_paths(client, committee_member, sync_env, monkeypatch):
    import fetch_historical_data as fhd

    def flaky_fetch(event_code, team_code='NBRC'):
        if event_code.endswith('BX10M'):
            raise RuntimeError('boom')
        return None  # no data

    monkeypatch.setattr(fhd, 'fetch_race_data', flaky_fetch)

    resp = client.post(
        '/api/results/sync',
        json={'years': [2024], 'race_codes': ['BX10M', 'BKH']},
        headers=auth(committee_member),
    )
    events = parse_sse(resp.text)
    statuses = {e['status'] for e in events if e['type'] == 'progress'}
    assert 'error' in statuses
    assert 'no_data' in statuses
    assert events[-1]['total_imported'] == 0
    assert events[-1]['total_errors'] == 1


def test_sync_all_races_when_no_codes(client, admin_member, sync_env):
    from fetch_historical_data import RACE_PATTERNS

    resp = client.post('/api/results/sync', json={'years': [2023, 2024]},
                       headers=auth(admin_member))
    events = parse_sse(resp.text)
    assert events[0]['total'] == 2 * len(RACE_PATTERNS)


# ---------------------------------------------------------------- member search

def test_member_search_no_results(client):
    resp = client.get('/api/results/member/Nobody')
    assert resp.status_code == 200
    assert resp.json() == {
        'results': [],
        'stats': {'total_races': 0, 'prs': {}, 'recent_results': []},
    }


def test_member_search_case_insensitive_with_prs(client, db_session):
    make_result(db_session, name='Jane Doe', race='Race A', race_distance='10K',
                overall_time='0:52:00', race_time=datetime(2023, 5, 1))
    make_result(db_session, name='Jane Doe', race='Race B', race_distance='10K',
                overall_time='0:48:00', race_time=datetime(2024, 5, 1))
    make_result(db_session, name='Jane Doe', race='Race C', race_distance='5K',
                overall_time='0:24:00', race_time=datetime(2024, 6, 1))
    make_result(db_session, name='Other Person', race='Race A')

    body = client.get('/api/results/member/jane doe').json()
    assert body['stats']['total_races'] == 3
    # Ordered by race_time desc
    assert [r['race'] for r in body['results']] == ['Race C', 'Race B', 'Race A']
    # PRs pick fastest per distance
    assert body['stats']['prs']['10K']['time'] == '0:48:00'
    assert body['stats']['prs']['10K']['race'] == 'Race B'
    assert body['stats']['prs']['5K']['time'] == '0:24:00'
    assert len(body['stats']['recent_results']) == 3


def test_member_search_recent_results_capped_at_5(client, db_session):
    for i in range(7):
        make_result(db_session, name='Prolific', race=f'Race {i}',
                    race_time=datetime(2024, 1, 1 + i))
    body = client.get('/api/results/member/Prolific').json()
    assert body['stats']['total_races'] == 7
    assert len(body['stats']['recent_results']) == 5


def test_member_search_invalid_gender_400(client, db_session):
    make_result(db_session, name='Jane Doe')
    resp = client.get('/api/results/member/Jane Doe?gender=X&birth_year=1990')
    assert resp.status_code == 400


def test_member_search_gender_birth_year_filter(client, db_session):
    # Race in 2024, age 30 -> calculated birth year 1994
    make_result(db_session, name='Jane Doe', gender_age='W30',
                race_time=datetime(2024, 5, 1))
    # Wrong gender
    make_result(db_session, name='Jane Doe', gender_age='M30',
                race_time=datetime(2024, 5, 1), race='Mens Race')
    # Wrong age -> birth year mismatch
    make_result(db_session, name='Jane Doe', gender_age='W50',
                race_time=datetime(2024, 5, 1), race='Old Race')
    # Malformed gender_age values are skipped
    make_result(db_session, name='Jane Doe', gender_age='W',
                race_time=datetime(2024, 5, 1), race='Short GA')
    make_result(db_session, name='Jane Doe', gender_age='Wxx',
                race_time=datetime(2024, 5, 1), race='Bad GA')

    body = client.get('/api/results/member/Jane Doe?gender=F&birth_year=1994').json()
    assert body['stats']['total_races'] == 1
    assert body['results'][0]['gender_age'] == 'W30'

    # +1 year tolerance: birthday not yet passed at race time
    body = client.get('/api/results/member/Jane Doe?gender=W&birth_year=1993').json()
    assert body['stats']['total_races'] == 1

    # Outside tolerance
    body = client.get('/api/results/member/Jane Doe?gender=F&birth_year=1992').json()
    assert body['stats']['total_races'] == 0
