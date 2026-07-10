"""Tests for routes/highlights.py (event groups/merge + grouped highlights page)."""
from datetime import date, timedelta

from tests.conftest import auth
from tests.helpers_events import make_event


def merge(client, member, a_id, b_id):
    return client.post('/api/events/groups/merge',
                       json={'event_a_id': a_id, 'event_b_id': b_id},
                       headers=auth(member))


# ---------- Merge ----------

def test_merge_requires_committee_or_admin(client, db_session, regular_member):
    a = make_event(db_session, name='A')
    b = make_event(db_session, name='B')
    resp = client.post('/api/events/groups/merge',
                       json={'event_a_id': a.id, 'event_b_id': b.id})
    assert resp.status_code == 401
    assert merge(client, regular_member, a.id, b.id).status_code == 403


def test_merge_event_not_found(client, db_session, admin_member):
    a = make_event(db_session, name='A')
    assert merge(client, admin_member, a.id, 999).status_code == 404
    assert merge(client, admin_member, 999, a.id).status_code == 404


def test_merge_with_itself_400(client, db_session, admin_member):
    a = make_event(db_session, name='A')
    assert merge(client, admin_member, a.id, a.id).status_code == 400


def test_merge_two_standalone_makes_b_parent(client, db_session, admin_member):
    a = make_event(db_session, name='Brooklyn Half 2024', chinese_name='布鲁克林半马 2024')
    b = make_event(db_session, name='Brooklyn Half 2023', chinese_name='布鲁克林半马 2023')
    resp = merge(client, admin_member, a.id, b.id)
    assert resp.status_code == 200
    body = resp.json()
    assert body['parent_event_id'] == b.id
    assert body['event_count'] == 2
    assert body['group_name'] == 'Brooklyn Half Marathon'  # name detector expands 'Half'
    assert body['group_name_cn'] == '布鲁克林半马'

    db_session.refresh(a)
    db_session.refresh(b)
    assert b.is_recurring is True
    assert a.parent_event_id == b.id
    assert a.is_recurring is False


def test_merge_onto_existing_parent_b(client, db_session, admin_member):
    parent = make_event(db_session, name='Track Night 2023', is_recurring=True)
    newbie = make_event(db_session, name='Track Night 2024')
    resp = merge(client, admin_member, newbie.id, parent.id)
    body = resp.json()
    assert body['parent_event_id'] == parent.id
    assert body['event_count'] == 2


def test_merge_when_a_is_parent(client, db_session, admin_member):
    parent = make_event(db_session, name='Track Night 2023', is_recurring=True)
    newbie = make_event(db_session, name='Track Night 2024')
    resp = merge(client, admin_member, parent.id, newbie.id)
    body = resp.json()
    assert body['parent_event_id'] == parent.id
    db_session.refresh(newbie)
    assert newbie.parent_event_id == parent.id


def test_merge_when_b_is_child_joins_its_parent(client, db_session, admin_member):
    parent = make_event(db_session, name='Run 2022', is_recurring=True)
    child = make_event(db_session, name='Run 2023', parent_event_id=parent.id)
    newbie = make_event(db_session, name='Run 2024')
    body = merge(client, admin_member, newbie.id, child.id).json()
    assert body['parent_event_id'] == parent.id
    assert body['event_count'] == 3


def test_merge_when_a_is_child_joins_its_parent(client, db_session, admin_member):
    parent = make_event(db_session, name='Run 2022', is_recurring=True)
    child = make_event(db_session, name='Run 2023', parent_event_id=parent.id)
    newbie = make_event(db_session, name='Run 2024')
    body = merge(client, admin_member, child.id, newbie.id).json()
    assert body['parent_event_id'] == parent.id
    db_session.refresh(newbie)
    assert newbie.parent_event_id == parent.id


def test_merge_committee_allowed(client, db_session, committee_member):
    a = make_event(db_session, name='A Run')
    b = make_event(db_session, name='B Run')
    assert merge(client, committee_member, a.id, b.id).status_code == 200


# ---------- Remove from group ----------

def test_remove_from_group_404(client, admin_member):
    resp = client.post('/api/events/999/remove-from-group', headers=auth(admin_member))
    assert resp.status_code == 404


def test_remove_from_group_not_in_group_400(client, db_session, admin_member):
    event = make_event(db_session)
    resp = client.post(f'/api/events/{event.id}/remove-from-group', headers=auth(admin_member))
    assert resp.status_code == 400


def test_remove_child_keeps_group_when_others_remain(client, db_session, admin_member):
    parent = make_event(db_session, is_recurring=True, group_name='G')
    c1 = make_event(db_session, parent_event_id=parent.id)
    make_event(db_session, parent_event_id=parent.id)
    body = client.post(f'/api/events/{c1.id}/remove-from-group',
                       headers=auth(admin_member)).json()
    assert body['group_dissolved'] is False
    db_session.refresh(c1)
    db_session.refresh(parent)
    assert c1.parent_event_id is None
    assert parent.is_recurring is True


def test_remove_last_child_dissolves_group(client, db_session, admin_member):
    parent = make_event(db_session, is_recurring=True, group_name='G', group_name_cn='组')
    child = make_event(db_session, parent_event_id=parent.id)
    body = client.post(f'/api/events/{child.id}/remove-from-group',
                       headers=auth(admin_member)).json()
    assert body['group_dissolved'] is True
    db_session.refresh(parent)
    assert parent.is_recurring is False
    assert parent.group_name is None
    assert parent.group_name_cn is None


def test_remove_parent_with_no_children_dissolves(client, db_session, admin_member):
    parent = make_event(db_session, is_recurring=True, group_name='G')
    body = client.post(f'/api/events/{parent.id}/remove-from-group',
                       headers=auth(admin_member)).json()
    assert body['group_dissolved'] is True
    db_session.refresh(parent)
    assert parent.is_recurring is False


def test_remove_parent_with_one_child_dissolves(client, db_session, admin_member):
    parent = make_event(db_session, is_recurring=True, group_name='G')
    child = make_event(db_session, parent_event_id=parent.id)
    body = client.post(f'/api/events/{parent.id}/remove-from-group',
                       headers=auth(admin_member)).json()
    assert body['group_dissolved'] is True
    db_session.refresh(parent)
    db_session.refresh(child)
    assert parent.is_recurring is False
    assert child.parent_event_id is None


def test_remove_parent_with_many_children_promotes_most_recent(client, db_session, admin_member):
    parent = make_event(db_session, event_date=date(2023, 1, 1), is_recurring=True,
                        group_name='Series', group_name_cn='系列')
    older = make_event(db_session, name='Older', event_date=date(2023, 6, 1),
                       parent_event_id=parent.id)
    newer = make_event(db_session, name='Newer', event_date=date(2023, 9, 1),
                       parent_event_id=parent.id)
    body = client.post(f'/api/events/{parent.id}/remove-from-group',
                       headers=auth(admin_member)).json()
    assert body['group_dissolved'] is False
    assert body['new_parent_id'] == newer.id

    for e in (parent, older, newer):
        db_session.refresh(e)
    assert newer.is_recurring is True
    assert newer.parent_event_id is None
    assert newer.group_name == 'Series'
    assert newer.group_name_cn == '系列'
    assert older.parent_event_id == newer.id
    assert parent.is_recurring is False
    assert parent.group_name is None


def test_remove_from_group_requires_auth(client, db_session, regular_member):
    parent = make_event(db_session, is_recurring=True)
    child = make_event(db_session, parent_event_id=parent.id)
    url = f'/api/events/{child.id}/remove-from-group'
    assert client.post(url).status_code == 401
    assert client.post(url, headers=auth(regular_member)).status_code == 403


# ---------- Highlights grouped ----------

def test_highlights_grouped_empty(client):
    body = client.get('/api/events/highlights/grouped').json()
    assert body == {'groups': [], 'standalone_events': []}


def test_highlights_grouped_excludes_future_and_cancelled(client, db_session):
    make_event(db_session, name='Future', event_date=date.today() + timedelta(days=5))
    make_event(db_session, name='Cxl', event_date=date(2022, 1, 1), status='Cancelled')
    past = make_event(db_session, name='Past Run', event_date=date(2022, 2, 1), status='Past')
    body = client.get('/api/events/highlights/grouped').json()
    assert body['groups'] == []
    assert [e['name'] for e in body['standalone_events']] == ['Past Run']


def test_highlights_grouped_groups_and_standalone(client, db_session):
    parent = make_event(db_session, name='Half 2022', event_date=date(2022, 5, 1),
                        status='Past', is_recurring=True,
                        group_name='Brooklyn Half', group_name_cn='布鲁克林半马',
                        image='p.jpg')
    child = make_event(db_session, name='Half 2023', event_date=date(2023, 5, 1),
                       status='Past', parent_event_id=parent.id,
                       image='c.jpg', image_position='top', is_highlight=True)
    solo = make_event(db_session, name='Solo 5K', event_date=date(2023, 1, 1), status='Past')

    body = client.get('/api/events/highlights/grouped').json()
    assert len(body['groups']) == 1
    group = body['groups'][0]
    assert group['parent_event_id'] == parent.id
    assert group['group_name'] == 'Brooklyn Half'
    assert group['group_name_cn'] == '布鲁克林半马'
    assert group['event_count'] == 2
    # Sorted by date descending inside the group
    assert [e['name'] for e in group['events']] == ['Half 2023', 'Half 2022']
    assert group['events'][0]['is_highlight'] is True
    # Cover comes from the most recent event
    assert group['cover_image'] == 'c.jpg'
    assert group['cover_image_position'] == 'top'
    assert group['cover_event_id'] == child.id
    assert group['most_recent_date'] == '2023-05-01'

    assert [e['name'] for e in body['standalone_events']] == ['Solo 5K']


def test_highlights_grouped_falls_back_to_parent_names(client, db_session):
    parent = make_event(db_session, name='Turkey Trot', chinese_name='火鸡跑',
                        event_date=date(2022, 11, 1), status='Past', is_recurring=True)
    make_event(db_session, name='Turkey Trot 2023', event_date=date(2023, 11, 1),
               status='Past', parent_event_id=parent.id)
    group = client.get('/api/events/highlights/grouped').json()['groups'][0]
    assert group['group_name'] == 'Turkey Trot'
    assert group['group_name_cn'] == '火鸡跑'


def test_highlights_grouped_parent_with_future_date_fetched_from_db(client, db_session):
    parent = make_event(db_session, name='Weekly Run',
                        event_date=date.today() + timedelta(days=3),
                        is_recurring=True, group_name='Weekly Run Series')
    make_event(db_session, name='Run 1', event_date=date(2023, 3, 1),
               status='Past', parent_event_id=parent.id)
    make_event(db_session, name='Run 2', event_date=date(2023, 3, 8),
               status='Past', parent_event_id=parent.id)

    body = client.get('/api/events/highlights/grouped').json()
    assert len(body['groups']) == 1
    group = body['groups'][0]
    assert group['parent_event_id'] == parent.id
    assert group['group_name'] == 'Weekly Run Series'
    assert group['event_count'] == 2  # future parent itself not listed
    assert body['standalone_events'] == []


def test_highlights_grouped_orphan_child_skipped(client, db_session):
    make_event(db_session, name='Orphan', event_date=date(2023, 1, 1),
               status='Past', parent_event_id=424242)
    body = client.get('/api/events/highlights/grouped').json()
    assert body['groups'] == []
    assert body['standalone_events'] == []


def test_highlights_grouped_single_event_group_becomes_standalone(client, db_session):
    # Past recurring parent with no children -> 1-event group -> standalone
    make_event(db_session, name='Lonely Parent', event_date=date(2022, 8, 1),
               status='Past', is_recurring=True)
    # Future parent with a single past child -> 1-event group -> standalone child
    future_parent = make_event(db_session, name='Future Parent',
                               event_date=date.today() + timedelta(days=1),
                               is_recurring=True)
    make_event(db_session, name='Only Child', event_date=date(2022, 9, 1),
               status='Past', parent_event_id=future_parent.id)

    body = client.get('/api/events/highlights/grouped').json()
    assert body['groups'] == []
    assert [e['name'] for e in body['standalone_events']] == ['Only Child', 'Lonely Parent']


def test_highlights_grouped_groups_sorted_by_recency(client, db_session):
    p1 = make_event(db_session, name='Old Series', event_date=date(2021, 1, 1),
                    status='Past', is_recurring=True)
    make_event(db_session, name='Old Child', event_date=date(2021, 6, 1),
               status='Past', parent_event_id=p1.id)
    p2 = make_event(db_session, name='New Series', event_date=date(2023, 1, 1),
                    status='Past', is_recurring=True)
    make_event(db_session, name='New Child', event_date=date(2023, 6, 1),
               status='Past', parent_event_id=p2.id)

    groups = client.get('/api/events/highlights/grouped').json()['groups']
    assert [g['parent_event_id'] for g in groups] == [p2.id, p1.id]


# ---------- Update group name ----------

def test_update_group_name_404(client, admin_member):
    resp = client.put('/api/events/groups/999/name', json={'group_name': 'X'},
                      headers=auth(admin_member))
    assert resp.status_code == 404


def test_update_group_name_not_parent_400(client, db_session, admin_member):
    event = make_event(db_session)
    resp = client.put(f'/api/events/groups/{event.id}/name', json={'group_name': 'X'},
                      headers=auth(admin_member))
    assert resp.status_code == 400


def test_update_group_name_success(client, db_session, committee_member):
    parent = make_event(db_session, is_recurring=True)
    resp = client.put(
        f'/api/events/groups/{parent.id}/name',
        json={'group_name': 'New Name', 'group_name_cn': '新名字'},
        headers=auth(committee_member),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['group_name'] == 'New Name'
    assert body['group_name_cn'] == '新名字'
    db_session.refresh(parent)
    assert parent.group_name == 'New Name'


def test_update_group_name_requires_auth(client, db_session, regular_member):
    parent = make_event(db_session, is_recurring=True)
    url = f'/api/events/groups/{parent.id}/name'
    assert client.put(url, json={'group_name': 'X'}).status_code == 401
    assert client.put(url, json={'group_name': 'X'},
                      headers=auth(regular_member)).status_code == 403


# ---------- Undo merge ----------

def test_undo_merge_event_404(client, admin_member):
    resp = client.post('/api/events/groups/1/undo-merge', params={'event_id': 999},
                       headers=auth(admin_member))
    assert resp.status_code == 404


def test_undo_merge_wrong_group_400(client, db_session, admin_member):
    parent = make_event(db_session, is_recurring=True)
    other = make_event(db_session)
    resp = client.post(f'/api/events/groups/{parent.id}/undo-merge',
                       params={'event_id': other.id}, headers=auth(admin_member))
    assert resp.status_code == 400


def test_undo_merge_keeps_group_when_children_remain(client, db_session, admin_member):
    parent = make_event(db_session, is_recurring=True, group_name='G')
    c1 = make_event(db_session, parent_event_id=parent.id)
    make_event(db_session, parent_event_id=parent.id)
    body = client.post(f'/api/events/groups/{parent.id}/undo-merge',
                       params={'event_id': c1.id}, headers=auth(admin_member)).json()
    assert body['group_dissolved'] is False
    db_session.refresh(c1)
    assert c1.parent_event_id is None


def test_undo_merge_dissolves_group_when_last_child(client, db_session, admin_member):
    parent = make_event(db_session, is_recurring=True, group_name='G', group_name_cn='组')
    child = make_event(db_session, parent_event_id=parent.id)
    body = client.post(f'/api/events/groups/{parent.id}/undo-merge',
                       params={'event_id': child.id}, headers=auth(admin_member)).json()
    assert body['group_dissolved'] is True
    db_session.refresh(parent)
    assert parent.is_recurring is False
    assert parent.group_name is None


def test_undo_merge_missing_parent_row(client, db_session, admin_member):
    """Child pointing at a nonexistent parent id: undo succeeds, nothing to dissolve."""
    child = make_event(db_session, parent_event_id=555555)
    body = client.post('/api/events/groups/555555/undo-merge',
                       params={'event_id': child.id}, headers=auth(admin_member)).json()
    assert body['group_dissolved'] is True
    db_session.refresh(child)
    assert child.parent_event_id is None


def test_undo_merge_requires_auth(client, db_session, regular_member):
    parent = make_event(db_session, is_recurring=True)
    child = make_event(db_session, parent_event_id=parent.id)
    url = f'/api/events/groups/{parent.id}/undo-merge'
    assert client.post(url, params={'event_id': child.id}).status_code == 401
    assert client.post(url, params={'event_id': child.id},
                       headers=auth(regular_member)).status_code == 403
