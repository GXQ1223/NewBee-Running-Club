"""Tests for email_service.py — Gmail SMTP notification emails.

All SMTP interaction is mocked; no email is ever sent. The module-level
config cache (_email_config) is reset per-test via monkeypatch so tests
never leak configuration into each other or into the rest of the suite.
"""
import smtplib
from unittest.mock import MagicMock

import pytest

import email_service
from email_service import EmailService, must_have_env


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def email_env(monkeypatch):
    """Fully configured email env with a fresh (uncached) config."""
    monkeypatch.setattr(email_service, '_email_config', None)
    monkeypatch.setenv('GMAIL_USER', 'club@test.local')
    monkeypatch.setenv('GMAIL_APP_PASSWORD', 'app-password-16ch')
    monkeypatch.setenv('WEBSITE_URL', 'https://test.newbee.local')


@pytest.fixture()
def no_email_env(monkeypatch):
    """GMAIL_USER / GMAIL_APP_PASSWORD unset (empty) with a fresh config."""
    monkeypatch.setattr(email_service, '_email_config', None)
    monkeypatch.setenv('GMAIL_USER', '')
    monkeypatch.setenv('GMAIL_APP_PASSWORD', '')
    monkeypatch.setenv('WEBSITE_URL', '')


@pytest.fixture()
def smtp_mock(monkeypatch):
    """Replace smtplib.SMTP with a MagicMock; returns the mock class."""
    mock = MagicMock()
    monkeypatch.setattr(smtplib, 'SMTP', mock)
    return mock


def smtp_server(smtp_mock):
    """The server object used inside `with smtplib.SMTP(...) as server`."""
    return smtp_mock.return_value.__enter__.return_value


def sent_message(smtp_mock):
    """The MIME message passed to server.send_message()."""
    return smtp_server(smtp_mock).send_message.call_args[0][0]


def html_part(msg):
    parts = msg.get_payload()
    part = parts[-1]
    assert part.get_content_type() == 'text/html'
    return part.get_payload(decode=True).decode('utf-8')


def text_part(msg):
    part = msg.get_payload()[0]
    assert part.get_content_type() == 'text/plain'
    return part.get_payload(decode=True).decode('utf-8')


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def test_must_have_env_returns_value(monkeypatch):
    monkeypatch.setenv('SOME_TEST_VAR', 'hello')
    assert must_have_env('SOME_TEST_VAR') == 'hello'


def test_must_have_env_raises_when_missing(monkeypatch):
    monkeypatch.delenv('SOME_MISSING_VAR', raising=False)
    with pytest.raises(Exception, match="SOME_MISSING_VAR"):
        must_have_env('SOME_MISSING_VAR')


def test_config_is_cached_after_first_load(email_env, monkeypatch):
    first = email_service._get_email_config()
    assert first['gmail_user'] == 'club@test.local'
    # Changing the env after the first load must not change the cached config
    monkeypatch.setenv('GMAIL_USER', 'other@test.local')
    second = email_service._get_email_config()
    assert second is first
    assert second['gmail_user'] == 'club@test.local'


def test_config_warns_when_password_missing(no_email_env, caplog):
    with caplog.at_level('WARNING', logger='email_service'):
        config = email_service._get_email_config()
    assert config['gmail_app_password'] == ''
    assert any('GMAIL_APP_PASSWORD not set' in r.message for r in caplog.records)


def test_website_url_proxy(email_env):
    url = email_service.WEBSITE_URL
    assert str(url) == 'https://test.newbee.local'
    assert url + '/admin' == 'https://test.newbee.local/admin'
    assert 'go to: ' + url == 'go to: https://test.newbee.local'
    assert f"{url}" == 'https://test.newbee.local'


# ---------------------------------------------------------------------------
# send_email
# ---------------------------------------------------------------------------

def test_send_email_skipped_without_password(no_email_env, smtp_mock):
    ok = EmailService.send_email('to@test.local', 'Subj', '<p>hi</p>', 'hi')
    assert ok is False
    smtp_mock.assert_not_called()


def test_send_email_success_with_text_fallback(email_env, smtp_mock):
    ok = EmailService.send_email('to@test.local', 'Subj 主题', '<p>hi html</p>', 'hi text')
    assert ok is True

    smtp_mock.assert_called_once_with('smtp.gmail.com', 587)
    server = smtp_server(smtp_mock)
    server.starttls.assert_called_once()
    server.login.assert_called_once_with('club@test.local', 'app-password-16ch')

    msg = sent_message(smtp_mock)
    assert msg['To'] == 'to@test.local'
    assert msg['Subject'] == 'Subj 主题'
    assert msg['From'] == 'NewBee Running Club <club@test.local>'
    parts = msg.get_payload()
    assert len(parts) == 2
    assert text_part(msg).strip() == 'hi text'
    assert html_part(msg).strip() == '<p>hi html</p>'


def test_send_email_html_only(email_env, smtp_mock):
    ok = EmailService.send_email('to@test.local', 'Subj', '<p>only html</p>')
    assert ok is True
    parts = sent_message(smtp_mock).get_payload()
    assert len(parts) == 1
    assert parts[0].get_content_type() == 'text/html'


def test_send_email_auth_error_returns_false(email_env, smtp_mock):
    smtp_server(smtp_mock).login.side_effect = smtplib.SMTPAuthenticationError(535, b'bad creds')
    ok = EmailService.send_email('to@test.local', 'Subj', '<p>hi</p>')
    assert ok is False
    smtp_server(smtp_mock).send_message.assert_not_called()


def test_send_email_smtp_error_returns_false(email_env, smtp_mock):
    smtp_server(smtp_mock).send_message.side_effect = smtplib.SMTPException('connection lost')
    ok = EmailService.send_email('to@test.local', 'Subj', '<p>hi</p>')
    assert ok is False


def test_send_email_unexpected_error_returns_false(email_env, smtp_mock):
    smtp_mock.side_effect = RuntimeError('boom')
    ok = EmailService.send_email('to@test.local', 'Subj', '<p>hi</p>')
    assert ok is False


# ---------------------------------------------------------------------------
# Composers — end-to-end through the mocked SMTP layer
# ---------------------------------------------------------------------------

def test_join_confirmation_composition(email_env, smtp_mock):
    ok = EmailService.send_join_confirmation('alice@test.local', 'Alice')
    assert ok is True

    msg = sent_message(smtp_mock)
    assert msg['To'] == 'alice@test.local'
    assert 'Welcome to NewBee Running Club' in msg['Subject']
    assert '欢迎加入新蜂跑团' in msg['Subject']

    html = html_part(msg)
    assert 'Dear Alice' in html
    assert '亲爱的 Alice' in html
    assert '感谢您的申请' in html
    assert 'https://test.newbee.local' in html  # WEBSITE_URL proxy resolved

    text = text_part(msg)
    assert 'Dear Alice' in text
    assert '亲爱的 Alice' in text


def test_join_confirmation_false_when_email_disabled(no_email_env, smtp_mock):
    assert EmailService.send_join_confirmation('alice@test.local', 'Alice') is False
    smtp_mock.assert_not_called()


# ---------------------------------------------------------------------------
# Composers — message content via a captured send_email
# ---------------------------------------------------------------------------

@pytest.fixture()
def capture_send(monkeypatch, email_env):
    """Patch EmailService.send_email and capture composed arguments."""
    sent = {}

    def fake_send(to_email, subject, body_html, body_text=None):
        sent.update(to=to_email, subject=subject, html=body_html, text=body_text)
        return True

    monkeypatch.setattr(EmailService, 'send_email', staticmethod(fake_send))
    return sent


def test_committee_notification(capture_send):
    form_data = {'Phone': '555-0101', 'Why join': 'I love running', 'Empty Field': ''}
    ok = EmailService.send_committee_notification('Bob', 'bob@test.local', 'NYRR-42', form_data)
    assert ok is True

    # Committee mail goes to the club Gmail account, not the applicant
    assert capture_send['to'] == 'club@test.local'
    assert capture_send['subject'] == 'New Member Application: Bob'
    assert 'bob@test.local' in capture_send['html']
    assert 'NYRR-42' in capture_send['html']
    assert 'I love running' in capture_send['html']
    # Empty form values are omitted
    assert 'Empty Field' not in capture_send['html']
    assert 'Empty Field' not in capture_send['text']
    assert 'https://test.newbee.local/admin' in capture_send['html']


def test_committee_notification_without_nyrr_id(capture_send):
    EmailService.send_committee_notification('Bob', 'bob@test.local', None, {})
    assert 'Not provided' in capture_send['html']
    assert 'Not provided' in capture_send['text']


def test_approval_notification(capture_send):
    ok = EmailService.send_approval_notification('carol@test.local', 'Carol')
    assert ok is True
    assert capture_send['to'] == 'carol@test.local'
    assert '您的申请已获批准' in capture_send['subject']
    assert 'Dear Carol' in capture_send['html']
    assert '恭喜' in capture_send['html']
    assert '恭喜' in capture_send['text']
    assert 'https://test.newbee.local' in capture_send['html']


def test_rejection_notification(capture_send):
    ok = EmailService.send_rejection_notification('dan@test.local', 'Dan', 'Incomplete application')
    assert ok is True
    assert capture_send['to'] == 'dan@test.local'
    assert '申请状态更新' in capture_send['subject']
    assert 'Incomplete application' in capture_send['html']
    assert 'Incomplete application' in capture_send['text']
    assert '亲爱的 Dan' in capture_send['html']
    assert 'newbeerunningclub@gmail.com' in capture_send['html']


def test_existing_member_account_notification(capture_send):
    ok = EmailService.send_existing_member_account_notification('Eve', 'eve@test.local')
    assert ok is True
    # Goes to the committee (club Gmail), about the member
    assert capture_send['to'] == 'club@test.local'
    assert capture_send['subject'] == 'Existing Member Account Request: Eve'
    assert 'eve@test.local' in capture_send['html']
    assert '现有成员账号申请' in capture_send['html']
    assert 'https://test.newbee.local/admin' in capture_send['html']
    assert 'Eve' in capture_send['text']
