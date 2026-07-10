"""Unit tests for utils/ (auth deps, time parsing, name detection, S3 with mocked boto3)."""
import math

import pytest
from fastapi import HTTPException

import utils.s3 as s3_module
from tests.conftest import make_member
from utils.auth import (
    get_current_admin,
    get_current_committee_or_admin,
    get_current_member_optional,
    get_current_member_required,
)
from utils.name_detector import (
    detect_common_name,
    detect_common_name_cn,
    detect_group_name_from_events,
    expand_distance,
    find_common_tokens,
    normalize_name,
    normalize_name_cn,
)
from utils.time import time_to_seconds


# ================================================================ utils/time

@pytest.mark.parametrize('value,expected', [
    ('1:05:30', 3930.0),        # H:MM:SS
    ('0:58:18', 3498.0),
    ('45:30', 2730.0),          # MM:SS
    (' 5:00 ', 300.0),          # surrounding whitespace
    ('42', 42.0),               # plain seconds
    ('3.5', 3.5),
])
def test_time_to_seconds_valid(value, expected):
    assert time_to_seconds(value) == expected


@pytest.mark.parametrize('value', ['abc', '1:xx:00', '', None, '1:2:3:4'])
def test_time_to_seconds_invalid_returns_inf(value):
    assert math.isinf(time_to_seconds(value))


# ================================================================ utils/auth

def test_get_current_admin_requires_header(db_session):
    with pytest.raises(HTTPException) as exc:
        get_current_admin(x_firebase_uid=None, db=db_session)
    assert exc.value.status_code == 401


def test_get_current_admin_unknown_uid_401(db_session):
    with pytest.raises(HTTPException) as exc:
        get_current_admin(x_firebase_uid='nobody', db=db_session)
    assert exc.value.status_code == 401


def test_get_current_admin_rejects_non_admin(db_session):
    member = make_member(db_session, status='committee')
    with pytest.raises(HTTPException) as exc:
        get_current_admin(x_firebase_uid=member.firebase_uid, db=db_session)
    assert exc.value.status_code == 403


def test_get_current_admin_success(db_session):
    member = make_member(db_session, status='admin')
    assert get_current_admin(x_firebase_uid=member.firebase_uid, db=db_session).id == member.id


def test_committee_or_admin_requires_header(db_session):
    with pytest.raises(HTTPException) as exc:
        get_current_committee_or_admin(x_firebase_uid=None, db=db_session)
    assert exc.value.status_code == 401


def test_committee_or_admin_unknown_uid_401(db_session):
    with pytest.raises(HTTPException) as exc:
        get_current_committee_or_admin(x_firebase_uid='nobody', db=db_session)
    assert exc.value.status_code == 401


def test_committee_or_admin_rejects_regular(db_session):
    member = make_member(db_session, status='active')
    with pytest.raises(HTTPException) as exc:
        get_current_committee_or_admin(x_firebase_uid=member.firebase_uid, db=db_session)
    assert exc.value.status_code == 403


@pytest.mark.parametrize('status', ['committee', 'admin'])
def test_committee_or_admin_success(db_session, status):
    member = make_member(db_session, status=status, uid=f'uid-{status}')
    found = get_current_committee_or_admin(x_firebase_uid=member.firebase_uid, db=db_session)
    assert found.id == member.id


def test_member_optional(db_session):
    assert get_current_member_optional(x_firebase_uid=None, db=db_session) is None
    assert get_current_member_optional(x_firebase_uid='nobody', db=db_session) is None
    member = make_member(db_session)
    assert get_current_member_optional(
        x_firebase_uid=member.firebase_uid, db=db_session).id == member.id


def test_member_required(db_session):
    with pytest.raises(HTTPException) as exc:
        get_current_member_required(x_firebase_uid=None, db=db_session)
    assert exc.value.status_code == 401
    with pytest.raises(HTTPException) as exc:
        get_current_member_required(x_firebase_uid='nobody', db=db_session)
    assert exc.value.status_code == 401
    member = make_member(db_session)
    assert get_current_member_required(
        x_firebase_uid=member.firebase_uid, db=db_session).id == member.id


# ================================================================ utils/name_detector

def test_normalize_name_strips_year_ordinal_annual_edition():
    assert normalize_name('Brooklyn Half 2024') == 'Brooklyn Half'
    assert normalize_name('3rd Annual Turkey Trot') == 'Turkey Trot'
    assert normalize_name('NYC Marathon 2023 Edition') == 'NYC Marathon'
    assert normalize_name('  spaced   out  ') == 'spaced out'
    assert normalize_name('') == ''
    assert normalize_name(None) == ''


def test_normalize_name_cn():
    assert normalize_name_cn('2024年 布鲁克林半马') == '布鲁克林半马'
    assert normalize_name_cn('第3届 火鸡跑') == '火鸡跑'
    assert normalize_name_cn('') == ''
    assert normalize_name_cn(None) == ''


def test_find_common_tokens():
    assert find_common_tokens([]) == []
    tokens = find_common_tokens(['Brooklyn Half 2024', 'Brooklyn Half 2023'])
    assert set(tokens) == {'brooklyn', 'half'}
    assert find_common_tokens(['Alpha Run', 'Beta Ride']) == []


def test_expand_distance():
    assert expand_distance('Brooklyn half') == 'Brooklyn Half Marathon'
    assert expand_distance('Queens 10k') == 'Queens 10K'
    assert expand_distance('Turkey Trot') == 'Turkey Trot'


def test_detect_common_name_year_variants():
    assert detect_common_name('Brooklyn Half 2024', 'Brooklyn Half 2023') == 'Brooklyn Half Marathon'
    assert detect_common_name('NYC Marathon 2024', 'NYC Marathon 2023') == 'NYC Marathon'
    assert detect_common_name('1st Annual Turkey Trot', '2nd Annual Turkey Trot') == 'Turkey Trot'


def test_detect_common_name_substring():
    # One normalized name contained in the other -> shorter wins
    assert detect_common_name('Queens 10K', 'Queens 10K Classic') == 'Queens 10K'


def test_detect_common_name_common_prefix():
    assert detect_common_name('Central Park Loop Run', 'Central Park Night Ride') == 'Central Park'


def test_detect_common_name_common_tokens_out_of_order():
    # No common prefix, but shared tokens reconstructed in first-name order
    assert detect_common_name('Fall NYC Classic', 'NYC Fall Classic') == 'Fall NYC Classic'


def test_detect_common_name_no_overlap_falls_back_to_first():
    assert detect_common_name('Alpha Run', 'Beta Ride') == 'Alpha Run'


def test_detect_common_name_empty_inputs():
    assert detect_common_name('', 'Brooklyn Half 2024') == 'Brooklyn Half'
    assert detect_common_name('Brooklyn Half 2024', '') == 'Brooklyn Half'
    assert detect_common_name('', '') == ''


def test_detect_common_name_cn_substring():
    # Substring detection works in both directions
    assert detect_common_name_cn('布鲁克林半马', '2024年布鲁克林半马嘉年华') == '布鲁克林半马'
    assert detect_common_name_cn('2024年布鲁克林半马嘉年华', '布鲁克林半马') == '布鲁克林半马'


def test_detect_common_name_cn_longest_common_substring():
    assert detect_common_name_cn('纽约五公里跑', '波士顿五公里赛') == '五公里'


def test_detect_common_name_cn_short_common_falls_back():
    # Common substring below 2 chars -> first name returned
    assert detect_common_name_cn('马拉松', '接力跑') == '马拉松'


def test_detect_common_name_cn_empty_inputs():
    assert detect_common_name_cn('', '第2届火鸡跑') == '火鸡跑'
    assert detect_common_name_cn('火鸡跑 2024', None) == '火鸡跑'


def test_detect_group_name_from_events():
    assert detect_group_name_from_events([]) == ('', '')

    single = detect_group_name_from_events(
        [{'name': 'Brooklyn Half 2024', 'chinese_name': '2024年布鲁克林半马'}])
    assert single == ('Brooklyn Half', '布鲁克林半马')

    multi = detect_group_name_from_events([
        {'name': 'Brooklyn Half 2022', 'chinese_name': '2022年布鲁克林半马'},
        {'name': 'Brooklyn Half 2023', 'chinese_name': '2023年布鲁克林半马'},
        {'name': 'Brooklyn Half 2024', 'chinese_name': '2024年布鲁克林半马'},
    ])
    assert multi == ('Brooklyn Half Marathon', '布鲁克林半马')


# ================================================================ utils/s3 (mocked)

class FakeS3Client:
    def __init__(self):
        self.put_calls = []
        self.delete_calls = []
        self.raise_on_delete = None

    def put_object(self, **kwargs):
        self.put_calls.append(kwargs)

    def delete_object(self, **kwargs):
        if self.raise_on_delete:
            raise self.raise_on_delete
        self.delete_calls.append(kwargs)


@pytest.fixture()
def s3_env(monkeypatch):
    """Configure fake AWS env vars and reset module-level caches."""
    monkeypatch.setenv('AWS_S3_BUCKET', 'test-bucket')
    monkeypatch.setenv('AWS_REGION', 'us-east-2')
    monkeypatch.setenv('AWS_ACCESS_KEY_ID', 'AKIATEST')
    monkeypatch.setenv('AWS_SECRET_ACCESS_KEY', 'secret')
    monkeypatch.setattr(s3_module, '_s3_bucket', None)
    monkeypatch.setattr(s3_module, '_s3_region', None)
    monkeypatch.setattr(s3_module, '_s3_client', None)

    fake = FakeS3Client()
    created = []

    def fake_boto3_client(service, **kwargs):
        created.append((service, kwargs))
        return fake

    monkeypatch.setattr(s3_module.boto3, 'client', fake_boto3_client)
    fake.created = created
    return fake


def test_must_have_env(monkeypatch):
    monkeypatch.setenv('SOME_TEST_VAR', 'value')
    assert s3_module.must_have_env('SOME_TEST_VAR') == 'value'
    monkeypatch.delenv('MISSING_TEST_VAR', raising=False)
    with pytest.raises(Exception, match="MISSING_TEST_VAR"):
        s3_module.must_have_env('MISSING_TEST_VAR')


def test_get_s3_config_missing_env(monkeypatch):
    monkeypatch.setattr(s3_module, '_s3_bucket', None)
    monkeypatch.setattr(s3_module, '_s3_region', None)
    monkeypatch.delenv('AWS_S3_BUCKET', raising=False)
    with pytest.raises(Exception, match='AWS_S3_BUCKET'):
        s3_module.get_s3_config()


def test_get_s3_client_cached(s3_env):
    client_a = s3_module.get_s3_client()
    client_b = s3_module.get_s3_client()
    assert client_a is client_b is s3_env
    assert len(s3_env.created) == 1  # boto3.client called once
    service, kwargs = s3_env.created[0]
    assert service == 's3'
    assert kwargs['region_name'] == 'us-east-2'


def test_get_s3_client_without_boto3(monkeypatch, s3_env):
    monkeypatch.setattr(s3_module, 'HAS_BOTO3', False)
    with pytest.raises(HTTPException) as exc:
        s3_module.get_s3_client()
    assert exc.value.status_code == 501


def test_upload_to_s3(s3_env):
    url = s3_module.upload_to_s3(b'image-bytes', 'photo.PNG', event_id=7,
                                 content_type='image/png')
    assert url.startswith('https://test-bucket.s3.us-east-2.amazonaws.com/gallery/event-7/')
    assert url.endswith('.PNG')
    [call] = s3_env.put_calls
    assert call['Bucket'] == 'test-bucket'
    assert call['Body'] == b'image-bytes'
    assert call['ContentType'] == 'image/png'
    assert call['Key'].startswith('gallery/event-7/')


def test_upload_to_s3_default_extension(s3_env):
    url = s3_module.upload_to_s3(b'x', 'noextension', event_id=1, content_type='image/jpeg')
    assert url.endswith('.jpg')


def test_delete_from_s3_ignores_non_s3_urls(s3_env):
    assert s3_module.delete_from_s3(None) is False
    assert s3_module.delete_from_s3('') is False
    assert s3_module.delete_from_s3('data:image/png;base64,AAAA') is False
    assert s3_module.delete_from_s3('https://other-bucket.s3.us-east-2.amazonaws.com/k') is False
    assert s3_env.delete_calls == []


def test_delete_from_s3_success(s3_env):
    url = 'https://test-bucket.s3.us-east-2.amazonaws.com/gallery/event-7/abc.jpg'
    assert s3_module.delete_from_s3(url) is True
    [call] = s3_env.delete_calls
    assert call == {'Bucket': 'test-bucket', 'Key': 'gallery/event-7/abc.jpg'}


def test_delete_from_s3_client_error_returns_false(s3_env):
    from botocore.exceptions import ClientError
    s3_env.raise_on_delete = ClientError(
        {'Error': {'Code': 'AccessDenied', 'Message': 'nope'}}, 'DeleteObject')
    url = 'https://test-bucket.s3.us-east-2.amazonaws.com/gallery/event-7/abc.jpg'
    assert s3_module.delete_from_s3(url) is False
