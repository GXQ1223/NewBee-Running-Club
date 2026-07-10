"""Tests for /api/banners (banner CRUD + homepage carousel merge)."""
from datetime import date

from database import BannerImage, Event
from tests.conftest import auth


def make_event(db_session, name='Test Event', **overrides):
    defaults = dict(
        name=name,
        chinese_name=f'{name} 中文',
        date=date(2025, 6, 1),
        time='8:00 AM',
        location='Central Park',
        description='desc',
        signup_link='https://signup.example.com',
        status='Upcoming',
        is_highlight=False,
    )
    defaults.update(overrides)
    event = Event(**defaults)
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    return event


def make_banner(db_session, image_url='https://img.example.com/b.jpg', **overrides):
    banner = BannerImage(image_url=image_url, **overrides)
    db_session.add(banner)
    db_session.commit()
    db_session.refresh(banner)
    return banner


PAYLOAD = {
    'image_url': 'https://img.example.com/new.jpg',
    'alt_text': 'alt',
    'label_en': 'Hello',
    'label_cn': '你好',
    'display_order': 3,
}


# ---------- GET /api/banners ----------

def test_get_banners_empty(client):
    resp = client.get('/api/banners')
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_banners_active_only_sorted(client, db_session):
    b2 = make_banner(db_session, display_order=2)
    b1 = make_banner(db_session, display_order=1)
    make_banner(db_session, display_order=0, is_active=False)

    body = client.get('/api/banners').json()
    assert [b['id'] for b in body] == [b1.id, b2.id]


# ---------- GET /api/banners/all ----------

def test_get_all_requires_auth(client):
    assert client.get('/api/banners/all').status_code == 401


def test_get_all_regular_forbidden(client, regular_member):
    resp = client.get('/api/banners/all', headers=auth(regular_member))
    assert resp.status_code == 403


def test_get_all_committee_forbidden(client, committee_member):
    # /all is admin-only
    resp = client.get('/api/banners/all', headers=auth(committee_member))
    assert resp.status_code == 403


def test_get_all_admin_includes_inactive(client, db_session, admin_member):
    make_banner(db_session, display_order=1)
    make_banner(db_session, display_order=0, is_active=False)

    body = client.get('/api/banners/all', headers=auth(admin_member)).json()
    assert len(body) == 2
    assert body[0]['is_active'] is False  # sorted by display_order


# ---------- GET /api/banners/{id} ----------

def test_get_banner_by_id(client, db_session):
    banner = make_banner(db_session, alt_text='specific')
    body = client.get(f'/api/banners/{banner.id}').json()
    assert body['id'] == banner.id
    assert body['alt_text'] == 'specific'


def test_get_banner_missing_404(client):
    assert client.get('/api/banners/999').status_code == 404


# ---------- POST /api/banners ----------

def test_create_requires_auth(client):
    assert client.post('/api/banners', json=PAYLOAD).status_code == 401


def test_create_regular_forbidden(client, regular_member):
    resp = client.post('/api/banners', json=PAYLOAD, headers=auth(regular_member))
    assert resp.status_code == 403


def test_create_admin(client, admin_member):
    resp = client.post('/api/banners', json=PAYLOAD, headers=auth(admin_member))
    assert resp.status_code == 200
    body = resp.json()
    assert body['image_url'] == PAYLOAD['image_url']
    assert body['display_order'] == 3
    assert body['is_active'] is True
    assert body['source_type'] == 'manual'


def test_create_missing_image_url_422(client, admin_member):
    resp = client.post('/api/banners', json={'alt_text': 'x'}, headers=auth(admin_member))
    assert resp.status_code == 422


# ---------- PUT /api/banners/{id} ----------

def test_update_requires_auth(client, db_session):
    banner = make_banner(db_session)
    assert client.put(f'/api/banners/{banner.id}', json={'label_en': 'x'}).status_code == 401


def test_update_admin(client, db_session, admin_member):
    banner = make_banner(db_session, label_en='old')
    resp = client.put(
        f'/api/banners/{banner.id}',
        json={'label_en': 'new', 'is_active': False},
        headers=auth(admin_member),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['label_en'] == 'new'
    assert body['is_active'] is False
    assert body['image_url'] == banner.image_url  # untouched field preserved


def test_update_missing_404(client, admin_member):
    resp = client.put('/api/banners/999', json={'label_en': 'x'}, headers=auth(admin_member))
    assert resp.status_code == 404


# ---------- DELETE /api/banners/{id} ----------

def test_delete_admin(client, db_session, admin_member):
    banner = make_banner(db_session)
    resp = client.delete(f'/api/banners/{banner.id}', headers=auth(admin_member))
    assert resp.status_code == 200
    assert client.get(f'/api/banners/{banner.id}').status_code == 404


def test_delete_missing_404(client, admin_member):
    assert client.delete('/api/banners/999', headers=auth(admin_member)).status_code == 404


def test_delete_committee_forbidden(client, db_session, committee_member):
    banner = make_banner(db_session)
    resp = client.delete(f'/api/banners/{banner.id}', headers=auth(committee_member))
    assert resp.status_code == 403


# ---------- GET /api/banners/carousel ----------

def test_carousel_empty(client):
    resp = client.get('/api/banners/carousel')
    assert resp.status_code == 200
    assert resp.json() == []


def test_carousel_manual_banners_sorted(client, db_session):
    b2 = make_banner(db_session, display_order=2)
    b1 = make_banner(db_session, display_order=1)
    make_banner(db_session, display_order=0, is_active=False)

    body = client.get('/api/banners/carousel').json()
    assert [item['id'] for item in body] == [b1.id, b2.id]
    assert all(item['source_type'] == 'manual' for item in body)


def test_carousel_banner_linked_to_event_populates_event_fields(client, db_session):
    event = make_event(db_session, name='Linked Event', image_position='top center')
    banner = make_banner(db_session, event_id=event.id)
    # Null out the column default so the event fallback is exercised
    banner.image_position = None
    db_session.commit()

    body = client.get('/api/banners/carousel').json()
    assert len(body) == 1
    item = body[0]
    assert item['id'] == banner.id
    assert item['event_id'] == event.id
    assert item['event_name'] == 'Linked Event'
    assert item['event_chinese_name'] == event.chinese_name
    assert item['event_date'] == '2025-06-01'
    assert item['event_time'] == '8:00 AM'
    assert item['event_location'] == 'Central Park'
    assert item['event_description'] == 'desc'
    assert item['event_signup_link'] == event.signup_link
    # Banner has no image_position -> falls back to event's
    assert item['image_position'] == 'top center'


def test_carousel_banner_own_image_position_wins(client, db_session):
    event = make_event(db_session, image_position='top center')
    make_banner(db_session, event_id=event.id, image_position='bottom left')

    body = client.get('/api/banners/carousel').json()
    assert body[0]['image_position'] == 'bottom left'


def test_carousel_highlight_events_only(client, db_session):
    older = make_event(db_session, name='Older Highlight', is_highlight=True,
                       date=date(2025, 1, 1), image='https://img/old.jpg')
    newer = make_event(db_session, name='Newer Highlight', is_highlight=True,
                       date=date(2025, 5, 1), image=None)
    make_event(db_session, name='Cancelled', is_highlight=True, status='Cancelled')
    make_event(db_session, name='Not Highlight', is_highlight=False)

    body = client.get('/api/banners/carousel').json()
    assert len(body) == 2
    # Ordered by event date desc, display_order assigned 1, 2
    assert [item['event_id'] for item in body] == [newer.id, older.id]
    assert [item['display_order'] for item in body] == [1, 2]
    # Negative ids distinguish auto highlight items from manual banners
    assert body[0]['id'] == -newer.id
    assert body[0]['source_type'] == 'event_highlight'
    assert body[0]['image_url'] == '/placeholder-event.png'  # no image
    assert body[1]['image_url'] == 'https://img/old.jpg'
    assert body[0]['label_en'] == 'Newer Highlight'
    assert body[0]['link_path'] is None


def test_carousel_merges_and_dedups_by_event_id(client, db_session):
    # Highlight event A already has a manual banner -> must not be duplicated
    event_a = make_event(db_session, name='A', is_highlight=True, date=date(2025, 3, 1))
    event_b = make_event(db_session, name='B', is_highlight=True, date=date(2025, 4, 1))
    banner_a = make_banner(db_session, event_id=event_a.id, display_order=5)
    plain = make_banner(db_session, display_order=2)

    body = client.get('/api/banners/carousel').json()
    # banner(order 2), banner_a(order 5), highlight B (order max(5)+1 = 6)
    assert [item['id'] for item in body] == [plain.id, banner_a.id, -event_b.id]
    assert [item['display_order'] for item in body] == [2, 5, 6]
    event_ids = [item['event_id'] for item in body if item['event_id']]
    assert event_ids.count(event_a.id) == 1  # deduped


def test_carousel_highlights_appended_after_unlinked_banners(client, db_session):
    # No banner has an event_id -> exercises the "no existing_event_ids" branch
    banner = make_banner(db_session, display_order=4)
    event = make_event(db_session, name='H', is_highlight=True)

    body = client.get('/api/banners/carousel').json()
    assert [item['id'] for item in body] == [banner.id, -event.id]
    assert body[1]['display_order'] == 5  # max manual order + 1
