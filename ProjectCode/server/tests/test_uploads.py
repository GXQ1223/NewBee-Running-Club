"""Tests for /api/upload/image (S3 image upload with PIL processing)."""
import io

import pytest
from fastapi import HTTPException
from PIL import Image

from tests.conftest import auth


def image_bytes(size=(10, 10), mode='RGB', fmt='PNG'):
    color = (255, 0, 0) if mode == 'RGB' else (255, 0, 0, 128)
    img = Image.new(mode, size, color)
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture()
def s3_stub(monkeypatch):
    """Patch S3 helpers as imported by routes.uploads — no network."""
    import routes.uploads as uploads_routes
    calls = []

    class FakeS3Client:
        def put_object(self, **kwargs):
            calls.append(kwargs)

    monkeypatch.setattr(uploads_routes, 'get_s3_client', lambda: FakeS3Client())
    monkeypatch.setattr(uploads_routes, 'get_s3_config', lambda: ('test-bucket', 'us-east-1'))
    return calls


def upload(client, headers=None, file=('photo.png', None, 'image/png')):
    name, content, ctype = file
    if content is None:
        content = image_bytes()
    return client.post('/api/upload/image', files={'file': (name, content, ctype)},
                       headers=headers or {})


def test_upload_requires_auth(client, s3_stub):
    assert upload(client).status_code == 401


def test_upload_regular_forbidden(client, regular_member, s3_stub):
    assert upload(client, headers=auth(regular_member)).status_code == 403


def test_upload_rejects_disallowed_type(client, committee_member, s3_stub):
    resp = upload(client, headers=auth(committee_member),
                  file=('doc.txt', b'hello', 'text/plain'))
    assert resp.status_code == 400
    assert 'not allowed' in resp.json()['detail']
    assert s3_stub == []


def test_upload_rejects_oversized_file(client, committee_member, s3_stub):
    big = b'x' * (20 * 1024 * 1024 + 1)
    resp = upload(client, headers=auth(committee_member), file=('big.jpg', big, 'image/jpeg'))
    assert resp.status_code == 400
    assert 'too large' in resp.json()['detail'].lower()
    assert s3_stub == []


def test_upload_success_committee(client, committee_member, s3_stub):
    resp = upload(client, headers=auth(committee_member))
    assert resp.status_code == 200
    url = resp.json()['url']
    assert url.startswith('https://test-bucket.s3.us-east-1.amazonaws.com/homepage/')
    assert url.endswith('.jpg')  # always re-encoded as JPEG

    assert len(s3_stub) == 1
    put = s3_stub[0]
    assert put['Bucket'] == 'test-bucket'
    assert put['ContentType'] == 'image/jpeg'
    # Body is a valid JPEG
    out = Image.open(io.BytesIO(put['Body']))
    assert out.format == 'JPEG'


def test_upload_success_admin(client, admin_member, s3_stub):
    assert upload(client, headers=auth(admin_member)).status_code == 200


def test_upload_converts_rgba_to_rgb(client, committee_member, s3_stub):
    resp = upload(client, headers=auth(committee_member),
                  file=('trans.png', image_bytes(mode='RGBA'), 'image/png'))
    assert resp.status_code == 200
    out = Image.open(io.BytesIO(s3_stub[0]['Body']))
    assert out.mode == 'RGB'


def test_upload_resizes_large_images(client, committee_member, s3_stub):
    resp = upload(client, headers=auth(committee_member),
                  file=('wide.png', image_bytes(size=(2400, 60)), 'image/png'))
    assert resp.status_code == 200
    out = Image.open(io.BytesIO(s3_stub[0]['Body']))
    assert max(out.size) <= 1920


def test_upload_extension_fallback_for_generic_content_type(client, committee_member, s3_stub):
    # content_type not in allowlist, but .png extension is
    resp = upload(client, headers=auth(committee_member),
                  file=('photo.png', image_bytes(), 'application/octet-stream'))
    assert resp.status_code == 200


def test_upload_no_filename_disallowed_type_400(client, committee_member, s3_stub):
    resp = upload(client, headers=auth(committee_member),
                  file=('data', b'raw', 'application/octet-stream'))
    assert resp.status_code == 400


def test_upload_corrupt_image_500(client, committee_member, s3_stub):
    resp = upload(client, headers=auth(committee_member),
                  file=('broken.jpg', b'not-an-image', 'image/jpeg'))
    assert resp.status_code == 500
    assert 'Failed to upload image' in resp.json()['detail']
    assert s3_stub == []


def test_upload_propagates_http_exception_from_s3(client, committee_member, monkeypatch):
    import routes.uploads as uploads_routes

    def boom():
        raise HTTPException(status_code=501, detail='S3 functionality not available')

    monkeypatch.setattr(uploads_routes, 'get_s3_client', boom)
    resp = upload(client, headers=auth(committee_member))
    assert resp.status_code == 501
