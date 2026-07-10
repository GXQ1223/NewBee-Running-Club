"""Tests for /api/settings (site settings, social links, join requirements)."""
from database import SiteSetting
from routes.settings import seed_social_links
from tests.conftest import auth


def make_setting(db_session, key, value=None, category='social', **overrides):
    setting = SiteSetting(key=key, value=value, category=category, **overrides)
    db_session.add(setting)
    db_session.commit()
    db_session.refresh(setting)
    return setting


# ---------- seed_social_links ----------

def test_seed_social_links_creates_defaults(db_session):
    seed_social_links(db_session)
    settings = {s.key: s for s in db_session.query(SiteSetting).all()}
    assert set(settings) == {
        'social_instagram', 'social_xiaohongshu', 'social_heylo',
        'social_shop', 'social_shop_demo_video',
    }
    assert 'instagram.com' in settings['social_instagram'].value
    assert settings['social_shop'].value == ''
    assert all(s.category == 'social' for s in settings.values())


def test_seed_social_links_idempotent_and_preserves_edits(db_session):
    seed_social_links(db_session)
    setting = db_session.query(SiteSetting).filter(SiteSetting.key == 'social_instagram').first()
    setting.value = 'https://instagram.com/custom'
    db_session.commit()

    seed_social_links(db_session)
    assert db_session.query(SiteSetting).count() == 5
    setting = db_session.query(SiteSetting).filter(SiteSetting.key == 'social_instagram').first()
    assert setting.value == 'https://instagram.com/custom'


# ---------- GET /api/settings/join-requirements ----------

def test_join_requirements_defaults(client):
    resp = client.get('/api/settings/join-requirements')
    assert resp.status_code == 200
    assert resp.json() == {'min_english_words': 120, 'min_chinese_chars': 240}


def test_join_requirements_custom_values(client, db_session):
    make_setting(db_session, 'join_min_english_words', value='80', category='join')
    make_setting(db_session, 'join_min_chinese_chars', value='150', category='join')
    body = client.get('/api/settings/join-requirements').json()
    assert body == {'min_english_words': 80, 'min_chinese_chars': 150}


def test_join_requirements_invalid_values_fall_back(client, db_session):
    make_setting(db_session, 'join_min_english_words', value='abc', category='join')
    make_setting(db_session, 'join_min_chinese_chars', value=None, category='join')
    body = client.get('/api/settings/join-requirements').json()
    assert body == {'min_english_words': 120, 'min_chinese_chars': 240}


def test_join_requirements_ignores_inactive_and_unknown_keys(client, db_session):
    make_setting(db_session, 'join_min_english_words', value='50', category='join',
                 is_active=False)
    make_setting(db_session, 'join_something_else', value='7', category='join')
    body = client.get('/api/settings/join-requirements').json()
    assert body == {'min_english_words': 120, 'min_chinese_chars': 240}


# ---------- GET /api/settings/social-links ----------

def test_social_links_empty(client):
    resp = client.get('/api/settings/social-links')
    assert resp.status_code == 200
    assert resp.json() == {
        'instagram': None, 'xiaohongshu': None, 'heylo': None,
        'shop': None, 'shop_demo_video': None,
    }


def test_social_links_after_seeding(client, db_session):
    seed_social_links(db_session)
    body = client.get('/api/settings/social-links').json()
    assert 'instagram.com' in body['instagram']
    assert 'xhslink.com' in body['xiaohongshu']
    assert 'heylo.com' in body['heylo']
    assert body['shop'] == ''
    assert body['shop_demo_video'] == ''


def test_social_links_ignore_inactive_and_unknown(client, db_session):
    make_setting(db_session, 'social_instagram', value='https://ig', is_active=False)
    make_setting(db_session, 'social_heylo', value='https://heylo')
    make_setting(db_session, 'social_mystery', value='https://mystery')
    body = client.get('/api/settings/social-links').json()
    assert body['instagram'] is None  # inactive excluded
    assert body['heylo'] == 'https://heylo'


# ---------- GET /api/settings ----------

def test_get_all_settings_requires_auth(client):
    assert client.get('/api/settings').status_code == 401


def test_get_all_settings_regular_forbidden(client, regular_member):
    assert client.get('/api/settings', headers=auth(regular_member)).status_code == 403


def test_get_all_settings_sorted_by_category_then_key(client, db_session, committee_member):
    make_setting(db_session, 'z_key', category='social')
    make_setting(db_session, 'a_key', category='social')
    make_setting(db_session, 'join_min_english_words', category='join')

    body = client.get('/api/settings', headers=auth(committee_member)).json()
    assert [s['key'] for s in body] == ['join_min_english_words', 'a_key', 'z_key']


# ---------- GET /api/settings/category/{category} ----------

def test_get_settings_by_category_requires_auth(client):
    assert client.get('/api/settings/category/social').status_code == 401


def test_get_settings_by_category(client, db_session, committee_member):
    make_setting(db_session, 'social_instagram', category='social')
    make_setting(db_session, 'join_min_english_words', category='join')

    body = client.get('/api/settings/category/join', headers=auth(committee_member)).json()
    assert [s['key'] for s in body] == ['join_min_english_words']

    body = client.get('/api/settings/category/none', headers=auth(committee_member)).json()
    assert body == []


# ---------- PUT /api/settings/{key} ----------

def test_update_setting_requires_auth(client, db_session):
    make_setting(db_session, 'social_shop')
    resp = client.put('/api/settings/social_shop', json={'value': 'x'})
    assert resp.status_code == 401


def test_update_setting_regular_forbidden(client, db_session, regular_member):
    make_setting(db_session, 'social_shop')
    resp = client.put('/api/settings/social_shop', json={'value': 'x'},
                      headers=auth(regular_member))
    assert resp.status_code == 403


def test_update_setting_missing_404(client, committee_member):
    resp = client.put('/api/settings/no_such_key', json={'value': 'x'},
                      headers=auth(committee_member))
    assert resp.status_code == 404


def test_update_setting_committee(client, db_session, committee_member):
    make_setting(db_session, 'social_shop', value='', label_en='Shop')
    resp = client.put(
        '/api/settings/social_shop',
        json={'value': 'https://shop.example.com', 'is_active': False, 'label_cn': '商店'},
        headers=auth(committee_member),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['value'] == 'https://shop.example.com'
    assert body['is_active'] is False
    assert body['label_cn'] == '商店'
    assert body['label_en'] == 'Shop'  # untouched field preserved


# ---------- POST /api/settings ----------

def test_create_setting_requires_auth(client):
    resp = client.post('/api/settings', json={'key': 'new_key'})
    assert resp.status_code == 401


def test_create_setting_committee_forbidden(client, committee_member):
    # Creation is admin-only (stricter than updates)
    resp = client.post('/api/settings', json={'key': 'new_key'},
                       headers=auth(committee_member))
    assert resp.status_code == 403


def test_create_setting_admin(client, admin_member):
    resp = client.post(
        '/api/settings',
        json={'key': 'join_min_english_words', 'value': '100', 'category': 'join',
              'label_en': 'Min words'},
        headers=auth(admin_member),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['key'] == 'join_min_english_words'
    assert body['value'] == '100'
    assert body['category'] == 'join'
    assert body['is_active'] is True


def test_create_setting_duplicate_key_400(client, db_session, admin_member):
    make_setting(db_session, 'social_shop')
    resp = client.post('/api/settings', json={'key': 'social_shop'},
                       headers=auth(admin_member))
    assert resp.status_code == 400
    assert 'already exists' in resp.json()['detail']
