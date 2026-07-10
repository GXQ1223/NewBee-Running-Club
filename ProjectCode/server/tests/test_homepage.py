"""Tests for /api/homepage-sections (sections CRUD + reorder)."""
from database import HomepageSection
from tests.conftest import auth


def make_section(db_session, title_en='Section', link_path='/somewhere', **overrides):
    section = HomepageSection(title_en=title_en, link_path=link_path, **overrides)
    db_session.add(section)
    db_session.commit()
    db_session.refresh(section)
    return section


PAYLOAD = {
    'title_en': 'Events',
    'title_cn': '活动',
    'image_url': 'https://img.example.com/s.jpg',
    'link_path': '/events',
    'display_order': 1,
}


# ---------- GET /api/homepage-sections ----------

def test_get_sections_empty(client):
    resp = client.get('/api/homepage-sections')
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_sections_active_only_sorted(client, db_session):
    s2 = make_section(db_session, display_order=2)
    s1 = make_section(db_session, display_order=1)
    make_section(db_session, display_order=0, is_active=False)

    body = client.get('/api/homepage-sections').json()
    assert [s['id'] for s in body] == [s1.id, s2.id]


# ---------- GET /api/homepage-sections/all ----------

def test_get_all_requires_auth(client):
    assert client.get('/api/homepage-sections/all').status_code == 401


def test_get_all_regular_forbidden(client, regular_member):
    resp = client.get('/api/homepage-sections/all', headers=auth(regular_member))
    assert resp.status_code == 403


def test_get_all_admin_includes_inactive(client, db_session, admin_member):
    make_section(db_session)
    make_section(db_session, is_active=False)
    body = client.get('/api/homepage-sections/all', headers=auth(admin_member)).json()
    assert len(body) == 2


# ---------- GET /api/homepage-sections/{id} ----------

def test_get_section_by_id(client, db_session):
    section = make_section(db_session, title_en='Specific')
    body = client.get(f'/api/homepage-sections/{section.id}').json()
    assert body['id'] == section.id
    assert body['title_en'] == 'Specific'


def test_get_section_missing_404(client):
    assert client.get('/api/homepage-sections/999').status_code == 404


# ---------- POST /api/homepage-sections ----------

def test_create_requires_auth(client):
    assert client.post('/api/homepage-sections', json=PAYLOAD).status_code == 401


def test_create_regular_forbidden(client, regular_member):
    resp = client.post('/api/homepage-sections', json=PAYLOAD, headers=auth(regular_member))
    assert resp.status_code == 403


def test_create_admin(client, admin_member):
    resp = client.post('/api/homepage-sections', json=PAYLOAD, headers=auth(admin_member))
    assert resp.status_code == 200
    body = resp.json()
    assert body['title_en'] == 'Events'
    assert body['title_cn'] == '活动'
    assert body['link_path'] == '/events'
    assert body['is_active'] is True


def test_create_missing_required_fields_422(client, admin_member):
    resp = client.post('/api/homepage-sections', json={'title_en': 'X'}, headers=auth(admin_member))
    assert resp.status_code == 422  # link_path is required


# ---------- PUT /api/homepage-sections/{id} ----------

def test_update_requires_auth(client, db_session):
    section = make_section(db_session)
    resp = client.put(f'/api/homepage-sections/{section.id}', json={'title_en': 'x'})
    assert resp.status_code == 401


def test_update_admin(client, db_session, admin_member):
    section = make_section(db_session, title_en='Old')
    resp = client.put(
        f'/api/homepage-sections/{section.id}',
        json={'title_en': 'New', 'is_active': False},
        headers=auth(admin_member),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['title_en'] == 'New'
    assert body['is_active'] is False
    assert body['link_path'] == section.link_path  # untouched field preserved


def test_update_missing_404(client, admin_member):
    resp = client.put('/api/homepage-sections/999', json={'title_en': 'x'}, headers=auth(admin_member))
    assert resp.status_code == 404


# ---------- DELETE /api/homepage-sections/{id} ----------

def test_delete_admin(client, db_session, admin_member):
    section = make_section(db_session)
    resp = client.delete(f'/api/homepage-sections/{section.id}', headers=auth(admin_member))
    assert resp.status_code == 200
    assert client.get(f'/api/homepage-sections/{section.id}').status_code == 404


def test_delete_missing_404(client, admin_member):
    assert client.delete('/api/homepage-sections/999', headers=auth(admin_member)).status_code == 404


def test_delete_regular_forbidden(client, db_session, regular_member):
    section = make_section(db_session)
    resp = client.delete(f'/api/homepage-sections/{section.id}', headers=auth(regular_member))
    assert resp.status_code == 403


# ---------- PUT /api/homepage-sections/reorder ----------

def test_reorder_requires_auth(client):
    resp = client.put('/api/homepage-sections/reorder', json={'section_ids': [1]})
    assert resp.status_code == 401


def test_reorder_regular_forbidden(client, regular_member):
    resp = client.put(
        '/api/homepage-sections/reorder',
        json={'section_ids': [1]},
        headers=auth(regular_member),
    )
    assert resp.status_code == 403


def test_reorder_sections(client, db_session, admin_member):
    a = make_section(db_session, title_en='A', display_order=0)
    b = make_section(db_session, title_en='B', display_order=1)
    c = make_section(db_session, title_en='C', display_order=2)

    resp = client.put(
        '/api/homepage-sections/reorder',
        json={'section_ids': [c.id, a.id, b.id]},
        headers=auth(admin_member),
    )
    assert resp.status_code == 200

    body = client.get('/api/homepage-sections').json()
    assert [s['id'] for s in body] == [c.id, a.id, b.id]
    assert [s['display_order'] for s in body] == [0, 1, 2]


def test_reorder_ignores_unknown_ids(client, db_session, admin_member):
    a = make_section(db_session, display_order=5)
    resp = client.put(
        '/api/homepage-sections/reorder',
        json={'section_ids': [999, a.id]},
        headers=auth(admin_member),
    )
    assert resp.status_code == 200
    body = client.get(f'/api/homepage-sections/{a.id}').json()
    assert body['display_order'] == 1  # index within the request list
