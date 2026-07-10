"""Tests for event gallery endpoints (images, S3 upload, likes, deletion moderation)."""
from datetime import date

import pytest

from database import (
    Event, EventGalleryImage, EventGalleryImageLike, GalleryDeletionRequest
)
from tests.conftest import auth, make_member

FAKE_S3_URL = 'https://test-bucket.s3.us-east-1.amazonaws.com/gallery/event-{eid}/fake.jpg'


def make_event(db_session, name='Gallery Event', **overrides):
    defaults = dict(name=name, date=date(2025, 6, 1), status='Past')
    defaults.update(overrides)
    event = Event(**defaults)
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    return event


def make_image(db_session, event_id, **overrides):
    defaults = dict(
        event_id=event_id,
        image_url=FAKE_S3_URL.format(eid=event_id),
        display_order=0,
    )
    defaults.update(overrides)
    image = EventGalleryImage(**defaults)
    db_session.add(image)
    db_session.commit()
    db_session.refresh(image)
    return image


@pytest.fixture()
def event(db_session):
    return make_event(db_session)


@pytest.fixture()
def s3_stub(monkeypatch):
    """Patch S3 helpers as imported by routes.gallery — no network."""
    import routes.gallery as gallery_routes
    calls = {'uploaded': [], 'deleted': []}

    def fake_upload(content, filename, event_id, content_type):
        calls['uploaded'].append(
            {'filename': filename, 'event_id': event_id,
             'content_type': content_type, 'size': len(content)}
        )
        return FAKE_S3_URL.format(eid=event_id)

    def fake_delete(image_url):
        calls['deleted'].append(image_url)
        return True

    monkeypatch.setattr(gallery_routes, 'upload_to_s3', fake_upload)
    monkeypatch.setattr(gallery_routes, 'delete_from_s3', fake_delete)
    return calls


# ---------- GET /api/events/{event_id}/gallery ----------

def test_get_gallery_event_missing_404(client):
    assert client.get('/api/events/999/gallery').status_code == 404


def test_get_gallery_empty(client, event):
    resp = client.get(f'/api/events/{event.id}/gallery')
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_gallery_active_only_sorted(client, db_session, event):
    second = make_image(db_session, event.id, display_order=2)
    first = make_image(db_session, event.id, display_order=1)
    make_image(db_session, event.id, is_active=False)

    body = client.get(f'/api/events/{event.id}/gallery').json()
    assert [img['id'] for img in body] == [first.id, second.id]


def test_get_gallery_user_liked_member(client, db_session, event, regular_member):
    liked = make_image(db_session, event.id, like_count=1, display_order=1)
    not_liked = make_image(db_session, event.id, display_order=2)
    db_session.add(EventGalleryImageLike(image_id=liked.id, member_id=regular_member.id))
    db_session.commit()

    body = client.get(f'/api/events/{event.id}/gallery', headers=auth(regular_member)).json()
    flags = {img['id']: img['user_liked'] for img in body}
    assert flags == {liked.id: True, not_liked.id: False}


def test_get_gallery_user_liked_anonymous(client, db_session, event):
    liked = make_image(db_session, event.id, like_count=1)
    db_session.add(EventGalleryImageLike(image_id=liked.id, anonymous_id='anon-1'))
    db_session.commit()

    body = client.get(f'/api/events/{event.id}/gallery?anonymous_id=anon-1').json()
    assert body[0]['user_liked'] is True
    # A different anonymous id sees no like
    body = client.get(f'/api/events/{event.id}/gallery?anonymous_id=anon-2').json()
    assert body[0]['user_liked'] is False


def test_get_gallery_pending_deletion_visibility(client, db_session, event,
                                                 regular_member, admin_member):
    image = make_image(db_session, event.id)
    db_session.add(GalleryDeletionRequest(
        image_id=image.id, requested_by_id=regular_member.id,
        reason='bad photo', status='pending'))
    db_session.commit()

    # Requester (non-admin): sees pending flag + own-request flag, no details
    body = client.get(f'/api/events/{event.id}/gallery', headers=auth(regular_member)).json()
    assert body[0]['has_pending_deletion_request'] is True
    assert body[0]['user_requested_deletion'] is True
    assert body[0]['deletion_request'] is None

    # Another regular member: pending flag but not their own request
    other = make_member(db_session, status='active', uid='other-uid')
    body = client.get(f'/api/events/{event.id}/gallery', headers=auth(other)).json()
    assert body[0]['has_pending_deletion_request'] is True
    assert body[0]['user_requested_deletion'] is False
    assert body[0]['deletion_request'] is None

    # Admin: sees full request details
    body = client.get(f'/api/events/{event.id}/gallery', headers=auth(admin_member)).json()
    req = body[0]['deletion_request']
    assert req is not None
    assert req['reason'] == 'bad photo'
    assert req['requested_by_name'] == regular_member.display_name

    # Resolved requests no longer flagged
    db_session.query(GalleryDeletionRequest).update({'status': 'rejected'})
    db_session.commit()
    body = client.get(f'/api/events/{event.id}/gallery').json()
    assert body[0]['has_pending_deletion_request'] is False


# ---------- GET /api/events/{event_id}/gallery/preview ----------

def test_preview_event_missing_404(client):
    assert client.get('/api/events/999/gallery/preview').status_code == 404


def test_preview_limit_and_has_more(client, db_session, event):
    for i in range(3):
        make_image(db_session, event.id, display_order=i)

    body = client.get(f'/api/events/{event.id}/gallery/preview?limit=2').json()
    assert len(body['images']) == 2
    assert body['total_count'] == 3
    assert body['has_more'] is True

    body = client.get(f'/api/events/{event.id}/gallery/preview').json()  # default limit 5
    assert len(body['images']) == 3
    assert body['has_more'] is False


def test_preview_user_liked_flags(client, db_session, event, regular_member):
    image = make_image(db_session, event.id, like_count=2)
    db_session.add(EventGalleryImageLike(image_id=image.id, member_id=regular_member.id))
    db_session.add(EventGalleryImageLike(image_id=image.id, anonymous_id='anon-9'))
    db_session.commit()

    body = client.get(f'/api/events/{event.id}/gallery/preview', headers=auth(regular_member)).json()
    assert body['images'][0]['user_liked'] is True

    body = client.get(f'/api/events/{event.id}/gallery/preview?anonymous_id=anon-9').json()
    assert body['images'][0]['user_liked'] is True

    body = client.get(f'/api/events/{event.id}/gallery/preview').json()
    assert body['images'][0]['user_liked'] is False


# ---------- POST /api/events/gallery/batch-preview ----------

def test_batch_preview(client, db_session, regular_member):
    event_a = make_event(db_session, name='A')
    event_b = make_event(db_session, name='B')
    img_a = make_image(db_session, event_a.id, like_count=1)
    db_session.add(EventGalleryImageLike(image_id=img_a.id, member_id=regular_member.id))
    db_session.commit()

    resp = client.post(
        '/api/events/gallery/batch-preview',
        json={'event_ids': [event_a.id, event_b.id]},
        headers=auth(regular_member),
    )
    assert resp.status_code == 200
    previews = resp.json()['previews']
    assert previews[str(event_a.id)]['total_count'] == 1
    assert previews[str(event_a.id)]['images'][0]['user_liked'] is True
    assert previews[str(event_b.id)] == {'images': [], 'total_count': 0, 'has_more': False}


def test_batch_preview_anonymous(client, db_session):
    event = make_event(db_session)
    img = make_image(db_session, event.id, like_count=1)
    db_session.add(EventGalleryImageLike(image_id=img.id, anonymous_id='anon-b'))
    db_session.commit()

    resp = client.post(
        '/api/events/gallery/batch-preview',
        json={'event_ids': [event.id], 'anonymous_id': 'anon-b'},
    )
    assert resp.json()['previews'][str(event.id)]['images'][0]['user_liked'] is True


# ---------- POST /api/events/{event_id}/gallery (upload) ----------

def _upload(client, event_id, headers=None, data=None,
            file=('photo.jpg', b'fake-image-bytes', 'image/jpeg')):
    return client.post(
        f'/api/events/{event_id}/gallery',
        files={'file': file},
        data=data or {},
        headers=headers or {},
    )


def test_upload_event_missing_404(client, s3_stub):
    assert _upload(client, 999).status_code == 404


def test_upload_rejects_non_image(client, event, s3_stub):
    resp = _upload(client, event.id, file=('doc.txt', b'hello', 'text/plain'))
    assert resp.status_code == 400
    assert s3_stub['uploaded'] == []


def test_upload_rejects_oversized_file(client, event, s3_stub):
    big = b'x' * (25 * 1024 * 1024 + 1)
    resp = _upload(client, event.id, file=('big.jpg', big, 'image/jpeg'))
    assert resp.status_code == 400
    assert 'too large' in resp.json()['detail'].lower()
    assert s3_stub['uploaded'] == []


def test_upload_as_member(client, db_session, event, regular_member, s3_stub):
    make_image(db_session, event.id, display_order=5)

    resp = _upload(client, event.id, headers=auth(regular_member),
                   data={'caption': 'nice', 'caption_cn': '很好'})
    assert resp.status_code == 200
    body = resp.json()
    assert body['image_url'] == FAKE_S3_URL.format(eid=event.id)
    assert body['caption'] == 'nice'
    assert body['caption_cn'] == '很好'
    assert body['uploaded_by_id'] == regular_member.id
    assert body['uploaded_by_name'] == regular_member.display_name
    assert body['display_order'] == 6  # max existing order + 1
    assert body['user_liked'] is False
    assert s3_stub['uploaded'][0]['event_id'] == event.id
    assert s3_stub['uploaded'][0]['content_type'] == 'image/jpeg'


def test_upload_anonymous_defaults_to_anonymous_name(client, event, s3_stub):
    resp = _upload(client, event.id)
    assert resp.status_code == 200
    body = resp.json()
    assert body['uploaded_by_id'] is None
    assert body['uploaded_by_name'] == 'Anonymous'
    assert body['display_order'] == 1


def test_upload_unknown_uid_treated_as_anonymous(client, event, s3_stub):
    resp = _upload(client, event.id, headers={'X-Firebase-UID': 'ghost'})
    assert resp.status_code == 200
    assert resp.json()['uploaded_by_id'] is None
    assert resp.json()['uploaded_by_name'] == 'Anonymous'


def test_upload_explicit_name_wins(client, event, regular_member, s3_stub):
    resp = _upload(client, event.id, headers=auth(regular_member),
                   data={'uploaded_by_name': 'Custom Name'})
    assert resp.json()['uploaded_by_name'] == 'Custom Name'
    assert resp.json()['uploaded_by_id'] == regular_member.id


# ---------- PUT /api/gallery/{image_id} ----------

def test_update_image_requires_auth(client, db_session, event):
    image = make_image(db_session, event.id)
    assert client.put(f'/api/gallery/{image.id}', json={'caption': 'x'}).status_code == 401


def test_update_image_regular_forbidden(client, db_session, event, regular_member):
    image = make_image(db_session, event.id)
    resp = client.put(f'/api/gallery/{image.id}', json={'caption': 'x'},
                      headers=auth(regular_member))
    assert resp.status_code == 403


def test_update_image_missing_404(client, committee_member):
    resp = client.put('/api/gallery/999', json={'caption': 'x'}, headers=auth(committee_member))
    assert resp.status_code == 404


def test_update_image_committee(client, db_session, event, committee_member):
    image = make_image(db_session, event.id)
    resp = client.put(
        f'/api/gallery/{image.id}',
        json={'caption': 'updated', 'is_active': False, 'display_order': 9},
        headers=auth(committee_member),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['caption'] == 'updated'
    assert body['is_active'] is False
    assert body['display_order'] == 9


# ---------- DELETE /api/gallery/{image_id} ----------

def test_delete_image_requires_auth(client, db_session, event):
    image = make_image(db_session, event.id)
    assert client.delete(f'/api/gallery/{image.id}').status_code == 401


def test_delete_image_missing_404(client, admin_member):
    resp = client.delete('/api/gallery/999', headers=auth(admin_member))
    assert resp.status_code == 404


def test_delete_image_unknown_member_401(client, db_session, event):
    image = make_image(db_session, event.id)
    resp = client.delete(f'/api/gallery/{image.id}', headers={'X-Firebase-UID': 'ghost'})
    assert resp.status_code == 401


def test_delete_image_non_uploader_forbidden(client, db_session, event, regular_member, s3_stub):
    image = make_image(db_session, event.id, uploaded_by_id=None)
    resp = client.delete(f'/api/gallery/{image.id}', headers=auth(regular_member))
    assert resp.status_code == 403
    assert s3_stub['deleted'] == []


def test_delete_image_by_uploader(client, db_session, event, regular_member, s3_stub):
    image = make_image(db_session, event.id, uploaded_by_id=regular_member.id)
    resp = client.delete(f'/api/gallery/{image.id}', headers=auth(regular_member))
    assert resp.status_code == 200
    assert s3_stub['deleted'] == [image.image_url]
    assert db_session.query(EventGalleryImage).count() == 0


def test_delete_image_by_admin_cleans_up_children(client, db_session, event,
                                                  admin_member, regular_member, s3_stub):
    image = make_image(db_session, event.id, like_count=1)
    db_session.add(EventGalleryImageLike(image_id=image.id, member_id=regular_member.id))
    db_session.add(GalleryDeletionRequest(
        image_id=image.id, requested_by_id=regular_member.id, reason='r', status='pending'))
    db_session.commit()

    resp = client.delete(f'/api/gallery/{image.id}', headers=auth(admin_member))
    assert resp.status_code == 200
    assert db_session.query(EventGalleryImage).count() == 0
    assert db_session.query(EventGalleryImageLike).count() == 0
    assert db_session.query(GalleryDeletionRequest).count() == 0


# ---------- POST /api/gallery/{image_id}/likes ----------

def test_like_image_missing_404(client):
    assert client.post('/api/gallery/999/likes?anonymous_id=a').status_code == 404


def test_like_requires_identity(client, db_session, event):
    image = make_image(db_session, event.id)
    resp = client.post(f'/api/gallery/{image.id}/likes')
    assert resp.status_code == 400


def test_member_like_toggle(client, db_session, event, regular_member):
    image = make_image(db_session, event.id)

    resp = client.post(f'/api/gallery/{image.id}/likes', headers=auth(regular_member))
    assert resp.status_code == 200
    assert resp.json() == {'image_id': image.id, 'like_count': 1, 'user_liked': True}

    resp = client.post(f'/api/gallery/{image.id}/likes', headers=auth(regular_member))
    assert resp.json() == {'image_id': image.id, 'like_count': 0, 'user_liked': False}
    assert db_session.query(EventGalleryImageLike).count() == 0


def test_anonymous_like_toggle(client, db_session, event):
    image = make_image(db_session, event.id)

    resp = client.post(f'/api/gallery/{image.id}/likes?anonymous_id=anon-x')
    assert resp.json()['like_count'] == 1
    like = db_session.query(EventGalleryImageLike).one()
    assert like.anonymous_id == 'anon-x'
    assert like.member_id is None

    resp = client.post(f'/api/gallery/{image.id}/likes?anonymous_id=anon-x')
    assert resp.json() == {'image_id': image.id, 'like_count': 0, 'user_liked': False}


def test_like_count_never_negative(client, db_session, event, regular_member):
    image = make_image(db_session, event.id, like_count=0)
    db_session.add(EventGalleryImageLike(image_id=image.id, member_id=regular_member.id))
    db_session.commit()

    # Unlike with count already at 0 -> stays at 0 (max(0, ...) guard)
    resp = client.post(f'/api/gallery/{image.id}/likes', headers=auth(regular_member))
    assert resp.json()['like_count'] == 0


# ---------- POST /api/gallery/{image_id}/deletion-request ----------

def test_deletion_request_requires_auth(client, db_session, event):
    image = make_image(db_session, event.id)
    resp = client.post(f'/api/gallery/{image.id}/deletion-request', json={'reason': 'r'})
    assert resp.status_code == 401


def test_deletion_request_unknown_member_401(client, db_session, event):
    image = make_image(db_session, event.id)
    resp = client.post(f'/api/gallery/{image.id}/deletion-request',
                       json={'reason': 'r'}, headers={'X-Firebase-UID': 'ghost'})
    assert resp.status_code == 401


def test_deletion_request_image_missing_404(client, regular_member):
    resp = client.post('/api/gallery/999/deletion-request',
                       json={'reason': 'r'}, headers=auth(regular_member))
    assert resp.status_code == 404


def test_deletion_request_empty_reason_422(client, db_session, event, regular_member):
    image = make_image(db_session, event.id)
    resp = client.post(f'/api/gallery/{image.id}/deletion-request',
                       json={'reason': ''}, headers=auth(regular_member))
    assert resp.status_code == 422


def test_deletion_request_success_and_duplicate_409(client, db_session, event, regular_member):
    image = make_image(db_session, event.id)
    resp = client.post(f'/api/gallery/{image.id}/deletion-request',
                       json={'reason': 'inappropriate'}, headers=auth(regular_member))
    assert resp.status_code == 200
    body = resp.json()
    assert body['image_id'] == image.id
    assert body['status'] == 'pending'
    assert body['requested_by_id'] == regular_member.id
    assert body['requested_by_name'] == regular_member.display_name

    # Second pending request from the same user is rejected
    resp = client.post(f'/api/gallery/{image.id}/deletion-request',
                       json={'reason': 'again'}, headers=auth(regular_member))
    assert resp.status_code == 409


# ---------- PUT /api/gallery/deletion-request/{request_id} ----------

def make_request(db_session, image_id, member, **overrides):
    defaults = dict(image_id=image_id, requested_by_id=member.id,
                    reason='please remove', status='pending')
    defaults.update(overrides)
    req = GalleryDeletionRequest(**defaults)
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)
    return req


def test_resolve_requires_auth(client):
    resp = client.put('/api/gallery/deletion-request/1', json={'approved': True})
    assert resp.status_code == 401


def test_resolve_regular_forbidden(client, regular_member):
    resp = client.put('/api/gallery/deletion-request/1', json={'approved': True},
                      headers=auth(regular_member))
    assert resp.status_code == 403


def test_resolve_unknown_member_forbidden(client, db_session):
    resp = client.put('/api/gallery/deletion-request/1', json={'approved': True},
                      headers={'X-Firebase-UID': 'ghost'})
    assert resp.status_code == 403


def test_resolve_missing_404(client, admin_member):
    resp = client.put('/api/gallery/deletion-request/999', json={'approved': True},
                      headers=auth(admin_member))
    assert resp.status_code == 404


def test_resolve_reject_keeps_image(client, db_session, event, regular_member,
                                    admin_member, s3_stub):
    image = make_image(db_session, event.id)
    req = make_request(db_session, image.id, regular_member)

    resp = client.put(f'/api/gallery/deletion-request/{req.id}',
                      json={'approved': False}, headers=auth(admin_member))
    assert resp.status_code == 200
    body = resp.json()
    assert body['status'] == 'rejected'
    assert body['resolved_by_id'] == admin_member.id
    assert body['resolved_at'] is not None
    assert body['requested_by_name'] == regular_member.display_name
    assert db_session.query(EventGalleryImage).count() == 1
    assert s3_stub['deleted'] == []

    # Cannot resolve twice
    resp = client.put(f'/api/gallery/deletion-request/{req.id}',
                      json={'approved': True}, headers=auth(admin_member))
    assert resp.status_code == 400


def test_resolve_approve_deletes_image(client, db_session, event, regular_member,
                                       committee_member, s3_stub):
    image = make_image(db_session, event.id, like_count=1)
    db_session.add(EventGalleryImageLike(image_id=image.id, member_id=regular_member.id))
    db_session.commit()
    req = make_request(db_session, image.id, regular_member)
    # A second pending request from another member is cleaned up too
    other = make_member(db_session, status='active', uid='other-uid')
    make_request(db_session, image.id, other)
    image_url = image.image_url

    resp = client.put(f'/api/gallery/deletion-request/{req.id}',
                      json={'approved': True}, headers=auth(committee_member))
    assert resp.status_code == 200
    body = resp.json()
    assert body['status'] == 'approved'
    assert body['resolved_by_id'] == committee_member.id
    assert body['resolved_at'] is not None
    assert body['requested_by_name'] == regular_member.display_name

    assert s3_stub['deleted'] == [image_url]
    assert db_session.query(EventGalleryImage).count() == 0
    assert db_session.query(EventGalleryImageLike).count() == 0
    assert db_session.query(GalleryDeletionRequest).count() == 0

    body = client.get(f'/api/events/{event.id}/gallery').json()
    assert body == []


def test_resolve_approve_image_already_gone(client, db_session, regular_member, admin_member):
    # Dangling image_id (SQLite does not enforce FKs) -> request is still resolvable
    req = make_request(db_session, 12345, regular_member)
    resp = client.put(f'/api/gallery/deletion-request/{req.id}',
                      json={'approved': True}, headers=auth(admin_member))
    assert resp.status_code == 200
    assert resp.json()['status'] == 'approved'
    assert resp.json()['resolved_at'] is not None
