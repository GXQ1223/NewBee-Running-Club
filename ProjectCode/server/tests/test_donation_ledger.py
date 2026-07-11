"""Tests for the donation-ledger backend change:

- Admin donation ledger: /api/donors/ledger, approve/dismiss, Gmail sync
  trigger, tax report export
- Donor.status filtering on all public/read donor endpoints
- sync_zelle_donations.py unit tests (parsing, record building, dedup,
  sync-status upsert, full sync flow against a fake IMAP mailbox)
- fetch_historical_data.generate_event_code Brooklyn Half code switch
- migrate_donation_ledger idempotent column migration
"""
import json
from datetime import date, datetime
from decimal import Decimal
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import fetch_historical_data
import migrate_donation_ledger
import sync_zelle_donations as szd
from database import Donor, SiteSetting
from tests.conftest import auth


def seed_donation(db_session, donor_id='D001', **overrides):
    defaults = dict(
        donor_id=donor_id,
        name=f'Donor {donor_id}',
        donor_type='individual',
        donation_event='General Support',
        amount=100,
        donation_date=date(2024, 1, 15),
        status='confirmed',
    )
    defaults.update(overrides)
    donor = Donor(**defaults)
    db_session.add(donor)
    db_session.commit()
    db_session.refresh(donor)
    return donor


def seed_setting(db_session, key, value):
    db_session.add(SiteSetting(
        key=key, value=value, label_en=key, label_cn=key,
        category='donors', is_active=True,
    ))
    db_session.commit()


# ---------------------------------------------------------------- ledger

def test_ledger_requires_auth(client):
    assert client.get('/api/donors/ledger').status_code == 401


def test_ledger_rejects_regular_member(client, regular_member):
    resp = client.get('/api/donors/ledger', headers=auth(regular_member))
    assert resp.status_code == 403


def test_ledger_returns_all_statuses_pending_first(client, db_session, committee_member):
    seed_donation(db_session, 'C1', donation_date=date(2025, 6, 1))
    seed_donation(db_session, 'P1', status='pending', donation_date=date(2024, 3, 1))
    seed_donation(db_session, 'X1', status='dismissed', donation_date=date(2025, 7, 1))

    resp = client.get('/api/donors/ledger', headers=auth(committee_member))
    assert resp.status_code == 200
    body = resp.json()
    donations = body['donations']
    assert len(donations) == 3
    # Pending floats to the top even though it is the oldest
    assert donations[0]['donor_id'] == 'P1'
    assert donations[0]['status'] == 'pending'
    statuses = {d['donor_id']: d['status'] for d in donations}
    assert statuses == {'P1': 'pending', 'C1': 'confirmed', 'X1': 'dismissed'}


def test_ledger_stats_only_count_confirmed(client, db_session, committee_member):
    current_year = date.today().year
    # Two confirmed this year from the same donor name, one confirmed last year
    seed_donation(db_session, 'A1', name='Li Chen', amount=200,
                  donation_date=date(current_year, 6, 1))
    seed_donation(db_session, 'A2', name='Li Chen', amount=100,
                  donation_date=date(current_year, 2, 1),
                  thank_you_sent_at=datetime(current_year, 2, 2))
    seed_donation(db_session, 'B1', name='Wei Zhang', amount=50,
                  donation_date=date(current_year - 1, 5, 1))
    # Pending and dismissed must not count toward totals
    seed_donation(db_session, 'P1', name='Ming Zhao', amount=999, status='pending',
                  donation_date=date(current_year, 7, 1))
    seed_donation(db_session, 'X1', name='Spam', amount=888, status='dismissed',
                  donation_date=date(current_year, 7, 2))

    resp = client.get('/api/donors/ledger', headers=auth(committee_member))
    stats = resp.json()['stats']
    assert float(stats['ytd_total']) == 300.0
    assert stats['ytd_count'] == 2
    assert float(stats['alltime_total']) == 350.0
    assert stats['alltime_count'] == 3
    assert stats['donor_count'] == 2  # Li Chen + Wei Zhang
    assert stats['pending_count'] == 1
    assert stats['unthanked_count'] == 2  # A1 + B1 (A2 was thanked)


def test_ledger_stats_empty_db(client, committee_member):
    resp = client.get('/api/donors/ledger', headers=auth(committee_member))
    stats = resp.json()['stats']
    assert float(stats['ytd_total']) == 0
    assert stats['alltime_count'] == 0
    assert stats['pending_count'] == 0


def test_ledger_sync_status_from_settings(client, db_session, committee_member):
    seed_setting(db_session, 'donation_sync_last_run', '2026-07-06T04:30:00')
    seed_setting(db_session, 'donation_sync_last_result',
                 json.dumps({'emails_found': 3, 'inserted': 2}))

    resp = client.get('/api/donors/ledger', headers=auth(committee_member))
    sync = resp.json()['sync']
    assert sync['last_run'] == '2026-07-06T04:30:00'
    assert sync['last_result'] == {'emails_found': 3, 'inserted': 2}
    # Scheduler is not running under tests
    assert sync['next_run'] is None


def test_ledger_sync_status_handles_missing_and_bad_json(client, db_session, committee_member):
    resp = client.get('/api/donors/ledger', headers=auth(committee_member))
    sync = resp.json()['sync']
    assert sync['last_run'] is None
    assert sync['last_result'] is None

    seed_setting(db_session, 'donation_sync_last_result', 'not json')
    resp = client.get('/api/donors/ledger', headers=auth(committee_member))
    assert resp.json()['sync']['last_result'] is None


def test_ledger_next_run_from_running_scheduler(client, committee_member, monkeypatch):
    import scheduler as scheduler_mod

    class FakeJob:
        next_run_time = datetime(2026, 7, 13, 4, 0)

    class FakeScheduler:
        running = True

        def get_job(self, job_id):
            assert job_id == 'sync_zelle_donations'
            return FakeJob()

    monkeypatch.setattr(scheduler_mod, 'scheduler', FakeScheduler())
    resp = client.get('/api/donors/ledger', headers=auth(committee_member))
    assert resp.json()['sync']['next_run'] == '2026-07-13T04:00:00'


def test_ledger_tolerates_legacy_null_columns(client, db_session, committee_member):
    """Rows inserted outside SQLAlchemy (CSV imports, raw SQL) can have NULL
    hide flags/timestamps; the ledger must still serialize them."""
    db_session.execute(text(
        "INSERT INTO donors (donor_id, name, donor_type, amount, status) "
        "VALUES ('LEGACY1', 'Legacy Donor', 'individual', 75, 'confirmed')"
    ))
    db_session.commit()

    resp = client.get('/api/donors/ledger', headers=auth(committee_member))
    assert resp.status_code == 200
    entry = resp.json()['donations'][0]
    assert entry['donor_id'] == 'LEGACY1'
    assert entry['created_at'] is None
    assert entry['hide_name'] is None


def test_ledger_next_run_none_when_scheduler_errors(client, committee_member, monkeypatch):
    import scheduler as scheduler_mod

    class BrokenScheduler:
        running = True

        def get_job(self, job_id):
            raise RuntimeError('scheduler unavailable')

    monkeypatch.setattr(scheduler_mod, 'scheduler', BrokenScheduler())
    resp = client.get('/api/donors/ledger', headers=auth(committee_member))
    assert resp.json()['sync']['next_run'] is None


def test_ledger_includes_email_excerpt_and_thank_you(client, db_session, committee_member):
    seed_donation(db_session, 'P1', status='pending',
                  email_excerpt='Zelle payment received — MING ZHAO sent you $150')
    resp = client.get('/api/donors/ledger', headers=auth(committee_member))
    entry = resp.json()['donations'][0]
    assert 'MING ZHAO' in entry['email_excerpt']
    assert entry['thank_you_sent_at'] is None


# ---------------------------------------------------------------- approve / dismiss

def test_approve_requires_auth(client, db_session):
    donor = seed_donation(db_session, 'P1', status='pending')
    resp = client.post(f'/api/donors/donations/{donor.donation_id}/approve', json={})
    assert resp.status_code == 401


def test_approve_rejects_regular_member(client, db_session, regular_member):
    donor = seed_donation(db_session, 'P1', status='pending')
    resp = client.post(f'/api/donors/donations/{donor.donation_id}/approve',
                       json={}, headers=auth(regular_member))
    assert resp.status_code == 403


def test_approve_unknown_donation_404(client, committee_member):
    resp = client.post('/api/donors/donations/99999/approve',
                       json={}, headers=auth(committee_member))
    assert resp.status_code == 404


def test_approve_confirms_pending_donation(client, db_session, committee_member):
    donor = seed_donation(db_session, 'P1', status='pending')
    resp = client.post(f'/api/donors/donations/{donor.donation_id}/approve',
                       json={}, headers=auth(committee_member))
    assert resp.status_code == 200
    assert resp.json()['status'] == 'confirmed'


def test_approve_applies_corrections(client, db_session, committee_member):
    donor = seed_donation(db_session, 'P1', status='pending', donor_type='individual')
    resp = client.post(
        f'/api/donors/donations/{donor.donation_id}/approve',
        json={'donor_type': 'enterprise', 'name': 'Golden Wheat Bakery', 'hide_name': True},
        headers=auth(committee_member),
    )
    body = resp.json()
    assert body['status'] == 'confirmed'
    assert body['donor_type'] == 'enterprise'
    assert body['name'] == 'Golden Wheat Bakery'
    assert body['hide_name'] is True


def test_dismiss_donation(client, db_session, committee_member):
    donor = seed_donation(db_session, 'P1', status='pending')
    resp = client.post(f'/api/donors/donations/{donor.donation_id}/dismiss',
                       headers=auth(committee_member))
    assert resp.status_code == 200
    assert resp.json()['status'] == 'dismissed'


def test_dismiss_unknown_donation_404(client, committee_member):
    resp = client.post('/api/donors/donations/99999/dismiss',
                       headers=auth(committee_member))
    assert resp.status_code == 404


def test_approved_donation_becomes_public(client, db_session, committee_member):
    donor = seed_donation(db_session, 'P1', status='pending')
    assert client.get('/api/donors/public').json() == []

    client.post(f'/api/donors/donations/{donor.donation_id}/approve',
                json={}, headers=auth(committee_member))
    public = client.get('/api/donors/public').json()
    assert len(public) == 1
    assert public[0]['donor_id'] == 'P1'


# ---------------------------------------------------------------- public filtering

def test_pending_and_dismissed_hidden_from_public_endpoints(client, db_session):
    seed_donation(db_session, 'C1')
    seed_donation(db_session, 'P1', status='pending')
    seed_donation(db_session, 'X1', status='dismissed')
    seed_donation(db_session, 'E1', donor_type='enterprise', status='pending')

    body = client.get('/api/donors').json()
    assert [d['donor_id'] for d in body['individual_donors']] == ['C1']
    assert body['enterprise_donors'] == []

    public = client.get('/api/donors/public').json()
    assert [d['donor_id'] for d in public] == ['C1']

    by_type = client.get('/api/donors/individual').json()
    assert [d['donor_id'] for d in by_type] == ['C1']

    summary = client.get('/api/donors/stats/summary').json()
    assert len(summary) == 1
    assert summary[0]['donor_type'] == 'individual'
    assert summary[0]['donor_count'] == 1


def test_get_donors_by_type_filters_both_types(client, db_session):
    seed_donation(db_session, 'I-C')
    seed_donation(db_session, 'I-X', status='dismissed')
    seed_donation(db_session, 'E-C', donor_type='enterprise')
    seed_donation(db_session, 'E-P', donor_type='enterprise', status='pending')

    individual = client.get('/api/donors/individual').json()
    enterprise = client.get('/api/donors/enterprise').json()
    assert [d['donor_id'] for d in individual] == ['I-C']
    assert [d['donor_id'] for d in enterprise] == ['E-C']


def test_confirmed_donors_still_respect_anonymous_rules(client, db_session):
    seed_donation(db_session, 'ANON', notes='Anonymous Donor')
    seed_donation(db_session, 'NOTE', notes='regular note')
    seed_donation(db_session, 'NULL', notes=None)

    # Anonymous excluded; NULL notes must still be listed
    body = client.get('/api/donors').json()
    assert sorted(d['donor_id'] for d in body['individual_donors']) == ['NOTE', 'NULL']

    public = client.get('/api/donors/public').json()
    assert sorted(d['donor_id'] for d in public) == ['NOTE', 'NULL']


def test_stats_summary_math_only_counts_confirmed(client, db_session):
    seed_donation(db_session, 'C1', amount=100)
    seed_donation(db_session, 'C2', amount=50)
    seed_donation(db_session, 'P1', amount=999, status='pending')
    seed_donation(db_session, 'X1', amount=888, status='dismissed')
    seed_donation(db_session, 'E1', amount=200, donor_type='enterprise')
    seed_donation(db_session, 'E2', amount=777, donor_type='enterprise', status='pending')

    body = client.get('/api/donors/stats/summary').json()
    by_type = {row['donor_type']: row for row in body}
    assert set(by_type) == {'individual', 'enterprise'}

    ind = by_type['individual']
    assert ind['donor_count'] == 2
    assert float(ind['total_amount']) == 150.0
    assert float(ind['average_amount']) == 75.0
    assert float(ind['min_amount']) == 50.0
    assert float(ind['max_amount']) == 100.0

    ent = by_type['enterprise']
    assert ent['donor_count'] == 1
    assert float(ent['total_amount']) == 200.0


# ---------------------------------------------------------------- sync-gmail

def test_sync_gmail_requires_auth(client):
    assert client.post('/api/donors/sync-gmail').status_code == 401


def test_sync_gmail_503_without_credentials(client, committee_member, monkeypatch):
    monkeypatch.delenv('GMAIL_USER', raising=False)
    monkeypatch.delenv('GMAIL_APP_PASSWORD', raising=False)
    resp = client.post('/api/donors/sync-gmail', headers=auth(committee_member))
    assert resp.status_code == 503


def test_sync_gmail_runs_sync_as_pending(client, committee_member, monkeypatch):
    monkeypatch.setenv('GMAIL_USER', 'club@test.local')
    monkeypatch.setenv('GMAIL_APP_PASSWORD', 'app-pass')

    calls = {}

    def fake_sync(status='pending'):
        calls['status'] = status
        return {'emails_found': 2, 'parsed': 2, 'duplicates': 1,
                'inserted': 1, 'errors': 0}

    monkeypatch.setattr(szd, 'sync_zelle_donations', fake_sync)

    resp = client.post('/api/donors/sync-gmail', headers=auth(committee_member))
    assert resp.status_code == 200
    assert resp.json()['inserted'] == 1
    assert calls['status'] == 'pending'


# ---------------------------------------------------------------- tax report

def test_tax_report_requires_auth(client):
    resp = client.get('/api/donors/tax-report',
                      params={'start_date': '2025-01-01', 'end_date': '2025-12-31'})
    assert resp.status_code == 401


def test_tax_report_invalid_format_400(client, committee_member):
    resp = client.get(
        '/api/donors/tax-report',
        params={'start_date': '2025-01-01', 'end_date': '2025-12-31', 'format': 'xlsx'},
        headers=auth(committee_member),
    )
    assert resp.status_code == 400


def test_tax_report_reversed_range_400(client, committee_member):
    resp = client.get(
        '/api/donors/tax-report',
        params={'start_date': '2025-12-31', 'end_date': '2025-01-01'},
        headers=auth(committee_member),
    )
    assert resp.status_code == 400


def test_tax_report_csv_includes_only_confirmed_in_range(client, db_session, committee_member):
    seed_donation(db_session, 'C1', name='Li Chen', amount=200,
                  donation_date=date(2025, 6, 4))
    seed_donation(db_session, 'C2', name='Wei Zhang', amount=120,
                  donation_date=date(2025, 5, 10))
    seed_donation(db_session, 'OLD', name='Old Donor', amount=75,
                  donation_date=date(2023, 1, 1))
    seed_donation(db_session, 'P1', name='Ming Zhao', amount=150, status='pending',
                  donation_date=date(2025, 7, 8))

    resp = client.get(
        '/api/donors/tax-report',
        params={'start_date': '2025-01-01', 'end_date': '2025-12-31', 'format': 'csv'},
        headers=auth(committee_member),
    )
    assert resp.status_code == 200
    assert resp.headers['content-type'].startswith('text/csv')
    assert 'attachment' in resp.headers['content-disposition']
    text_body = resp.text
    assert 'Li Chen' in text_body
    assert 'Wei Zhang' in text_body
    assert 'Old Donor' not in text_body
    assert 'Ming Zhao' not in text_body
    assert '320.00' in text_body  # totals row


def test_tax_report_pdf_summary(client, db_session, committee_member):
    seed_donation(db_session, 'C1', name='Li Chen', amount=200,
                  donation_date=date(2025, 6, 4))
    seed_donation(db_session, 'C2', name='Li Chen', amount=100,
                  donation_date=date(2025, 2, 12))

    resp = client.get(
        '/api/donors/tax-report',
        params={'start_date': '2025-01-01', 'end_date': '2025-12-31', 'format': 'pdf'},
        headers=auth(committee_member),
    )
    assert resp.status_code == 200
    assert resp.headers['content-type'] == 'application/pdf'
    assert resp.content.startswith(b'%PDF')


def test_tax_report_pdf_empty_range(client, committee_member):
    resp = client.get(
        '/api/donors/tax-report',
        params={'start_date': '2020-01-01', 'end_date': '2020-12-31', 'format': 'pdf'},
        headers=auth(committee_member),
    )
    assert resp.status_code == 200
    assert resp.content.startswith(b'%PDF')


# ---------------------------------------------------------------------------
# sync_zelle_donations.py unit tests
# ---------------------------------------------------------------------------

@pytest.fixture()
def zelle_db(db_session, monkeypatch):
    """Bind the module-level Session factory to the test database."""
    factory = sessionmaker(autocommit=False, autoflush=False,
                           bind=db_session.get_bind())
    monkeypatch.setattr(szd, 'Session', factory)
    return db_session


# ---- email builders

def full_zelle_email(sender='JOHN DOE', amount='1,250.00', sent_on='Jul 05, 2026',
                     txn='23456789', memo='Marathon fund'):
    """Realistic multipart Chase Zelle notification with an HTML body."""
    html = f"""<html><head><style>.body {{ color: #117ACA; }}</style></head><body>
<script>var tracking = 1;</script>
<p>{sender} sent you money with Zelle&reg;</p>
<table>
<tr><td>Amount</td><td>${amount}</td></tr>
<tr><td>Sent on</td><td>{sent_on}</td></tr>
<tr><td>Transaction number:</td><td>{txn}</td></tr>
<tr><td>Memo</td><td>{memo}</td></tr>
</table>
<p>{sender} is registered with Zelle.</p>
</body></html>"""
    msg = MIMEMultipart('alternative')
    msg['From'] = 'Chase <no.reply.alerts@chase.com>'
    msg['Subject'] = 'You received money with Zelle(R)'
    msg['Date'] = 'Sun, 05 Jul 2026 09:30:00 -0400'
    msg.attach(MIMEText('You received money with Zelle.', 'plain'))
    msg.attach(MIMEText(html, 'html'))
    return msg.as_bytes()


def minimal_zelle_email():
    """Plain-text email without Amount label, Sent on line, txn or memo."""
    msg = MIMEText('JANE A SMITH sent you $50.00 with Zelle.', 'plain')
    msg['From'] = 'Chase <no.reply.alerts@chase.com>'
    msg['Subject'] = 'Zelle payment'
    msg['Date'] = 'Sat, 04 Jul 2026 12:00:00 -0400'
    return msg.as_bytes()


def not_incoming_email():
    msg = MIMEText('You requested $25.00 from JOHN DOE with Zelle.', 'plain')
    msg['Date'] = 'Sat, 04 Jul 2026 12:00:00 -0400'
    return msg.as_bytes()


def lowercase_sender_email():
    msg = MIMEText('john doe sent you $25.00 with Zelle.', 'plain')
    msg['Date'] = 'Sat, 04 Jul 2026 12:00:00 -0400'
    return msg.as_bytes()


def no_amount_email():
    msg = MIMEText('MARY JONES sent you a payment with Zelle.', 'plain')
    msg['Date'] = 'Sat, 04 Jul 2026 12:00:00 -0400'
    return msg.as_bytes()


def empty_body_email():
    msg = MIMEText('', 'plain')
    msg['Date'] = 'Sat, 04 Jul 2026 12:00:00 -0400'
    return msg.as_bytes()


def parsed_full():
    return {
        'sender_name': 'John Doe',
        'amount': Decimal('1250.00'),
        'donation_date': date(2026, 7, 5),
        'transaction_number': '23456789',
        'memo': 'Marathon fund',
    }


def parsed_minimal():
    return {
        'sender_name': 'Jane A Smith',
        'amount': Decimal('50.00'),
        'donation_date': None,
        'transaction_number': None,
        'memo': None,
    }


# ---- connect_to_gmail / search_zelle_emails

def test_connect_to_gmail_requires_credentials(monkeypatch):
    monkeypatch.setattr(szd, 'GMAIL_USER', None)
    monkeypatch.setattr(szd, 'GMAIL_APP_PASSWORD', None)
    with pytest.raises(ValueError, match='GMAIL_USER and GMAIL_APP_PASSWORD'):
        szd.connect_to_gmail()


def test_connect_to_gmail_logs_in_and_selects_folder(monkeypatch):
    calls = []

    class FakeIMAP:
        def __init__(self, server, port):
            calls.append(('init', server, port))

        def login(self, user, password):
            calls.append(('login', user, password))

        def select(self, folder, readonly=False):
            calls.append(('select', folder, readonly))

    monkeypatch.setattr(szd, 'GMAIL_USER', 'club@test.local')
    monkeypatch.setattr(szd, 'GMAIL_APP_PASSWORD', 'app-pass')
    monkeypatch.setattr(szd.imaplib, 'IMAP4_SSL', FakeIMAP)

    mail = szd.connect_to_gmail()

    assert isinstance(mail, FakeIMAP)
    assert calls == [
        ('init', 'imap.gmail.com', 993),
        ('login', 'club@test.local', 'app-pass'),
        ('select', szd.IMAP_FOLDER, True),
    ]


class FakeSearchMail:
    def __init__(self, status='OK', ids=b'1 2 3'):
        self.status = status
        self.ids = ids
        self.criteria = None

    def search(self, charset, criteria):
        self.criteria = criteria
        return (self.status, [self.ids])


def test_search_zelle_emails_returns_ids_and_applies_since():
    mail = FakeSearchMail()
    assert szd.search_zelle_emails(mail) == [b'1', b'2', b'3']
    assert 'SINCE' not in mail.criteria

    mail = FakeSearchMail()
    szd.search_zelle_emails(mail, since_date='01-Jan-2026')
    assert 'SINCE 01-Jan-2026' in mail.criteria


def test_search_zelle_emails_failure_returns_empty():
    assert szd.search_zelle_emails(FakeSearchMail(status='NO')) == []


# ---- strip_html

def test_strip_html_removes_tags_and_decodes_entities():
    assert szd.strip_html('<b>Fish</b> &amp; <i>Chips</i> &copy;') == 'Fish & Chips ©'


def test_strip_html_converts_br_and_blocks_to_newlines():
    result = szd.strip_html('line1<br>line2<br />line3')
    assert result.splitlines() == ['line1', 'line2', 'line3']

    result = szd.strip_html('<p>para1</p><p>para2</p>')
    assert [line.strip() for line in result.splitlines()] == ['para1', 'para2']


def test_strip_html_removes_style_and_script_blocks():
    html = '<style>body { color: red; }</style>Hi<script>alert("x")</script>'
    assert szd.strip_html(html) == 'Hi'


# ---- parse_zelle_email

def test_parse_full_multipart_email():
    parsed = szd.parse_zelle_email(full_zelle_email())
    assert parsed == {
        'sender_name': 'John Doe',
        'amount': Decimal('1250.00'),
        'donation_date': date(2026, 7, 5),
        'transaction_number': '23456789',
        'memo': 'Marathon fund',
    }


def test_parse_minimal_email_uses_fallbacks():
    parsed = szd.parse_zelle_email(minimal_zelle_email())
    assert parsed['sender_name'] == 'Jane A Smith'
    assert parsed['amount'] == Decimal('50.00')
    # No "Sent on" line: falls back to the Date header
    assert parsed['donation_date'] == date(2026, 7, 4)
    assert parsed['transaction_number'] is None
    assert parsed['memo'] is None


def test_parse_rejects_non_incoming_payment():
    assert szd.parse_zelle_email(not_incoming_email()) is None


def test_parse_rejects_lowercase_sender_name():
    # "sent you" is present but the uppercase sender pattern cannot match
    assert szd.parse_zelle_email(lowercase_sender_email()) is None


def test_parse_invalid_sent_on_date_falls_back_to_header():
    raw = full_zelle_email(sent_on='Feb 30, 2026')  # matches regex, bad date
    parsed = szd.parse_zelle_email(raw)
    assert parsed['donation_date'] == date(2026, 7, 5)  # from Date header


def test_parse_missing_date_header_falls_back_to_today():
    msg = MIMEText('JANE A SMITH sent you $50.00 with Zelle.', 'plain')
    parsed = szd.parse_zelle_email(msg.as_bytes())
    assert parsed['donation_date'] == datetime.now().date()


def test_parse_rejects_email_without_amount():
    assert szd.parse_zelle_email(no_amount_email()) is None


def test_parse_rejects_empty_body():
    assert szd.parse_zelle_email(empty_body_email()) is None


# ---- build_email_excerpt

def test_build_email_excerpt_full():
    excerpt = szd.build_email_excerpt(parsed_full())
    assert excerpt == (
        'Zelle payment received — John Doe sent you $1250.00'
        ' · Sent on Jul 05, 2026'
        ' · Transaction #23456789'
        ' · Memo: Marathon fund'
    )


def test_build_email_excerpt_minimal():
    excerpt = szd.build_email_excerpt(parsed_minimal())
    assert excerpt == 'Zelle payment received — Jane A Smith sent you $50.00'


# ---- build_donor_record

def test_build_donor_record_defaults_to_pending():
    record = szd.build_donor_record(parsed_full())
    assert record['status'] == 'pending'
    assert record['name'] == 'John Doe'
    assert record['amount'] == Decimal('1250.00')
    assert record['donation_date'] == date(2026, 7, 5)
    assert record['donor_id'].startswith('IND_')
    assert record['donor_id'][4:].isdigit()
    assert record['donor_type'] == 'individual'
    assert record['source'] == 'Zelle (John Doe)'
    assert record['notes'] == 'Zelle Transaction #23456789'
    assert record['message'] == 'Marathon fund'
    assert record['email_excerpt'] == szd.build_email_excerpt(parsed_full())


def test_build_donor_record_explicit_confirmed_and_no_txn():
    record = szd.build_donor_record(parsed_minimal(), status='confirmed')
    assert record['status'] == 'confirmed'
    assert record['notes'] == 'Zelle (no transaction #)'
    assert record['message'] is None
    assert record['email_excerpt'] == szd.build_email_excerpt(parsed_minimal())


# ---- is_duplicate

def test_is_duplicate(db_session):
    seed_donation(db_session, 'Z1', notes='Zelle Transaction #23456789')
    assert szd.is_duplicate(db_session, '23456789') is True
    assert szd.is_duplicate(db_session, '99999999') is False
    assert szd.is_duplicate(db_session, None) is False


# ---- record_sync_status

def test_record_sync_status_creates_then_updates(zelle_db):
    db_session = zelle_db
    szd.record_sync_status({'inserted': 2, 'errors': 0})

    run1 = db_session.query(SiteSetting).filter(
        SiteSetting.key == 'donation_sync_last_run').all()
    result1 = db_session.query(SiteSetting).filter(
        SiteSetting.key == 'donation_sync_last_result').all()
    assert len(run1) == 1 and len(result1) == 1
    assert json.loads(result1[0].value) == {'inserted': 2, 'errors': 0}

    szd.record_sync_status({'inserted': 5, 'errors': 1})
    db_session.expire_all()

    run2 = db_session.query(SiteSetting).filter(
        SiteSetting.key == 'donation_sync_last_run').all()
    result2 = db_session.query(SiteSetting).filter(
        SiteSetting.key == 'donation_sync_last_result').all()
    # Upsert: still exactly one row per key, values updated
    assert len(run2) == 1 and len(result2) == 1
    assert json.loads(result2[0].value) == {'inserted': 5, 'errors': 1}


# ---- sync_zelle_donations flow

class FakeMail:
    """Minimal IMAP stand-in: fetch from a dict of id -> raw email bytes."""

    def __init__(self, emails, fail_ids=(), bad_ids=(), raise_on_close=False):
        self.emails = emails
        self.fail_ids = set(fail_ids)   # fetch returns a NO status
        self.bad_ids = set(bad_ids)     # fetch returns OK with garbage payload
        self.raise_on_close = raise_on_close

    def fetch(self, eid, spec):
        assert spec == '(RFC822)'
        if eid in self.fail_ids:
            return ('NO', None)
        if eid in self.bad_ids:
            return ('OK', None)
        return ('OK', [(b'1 (RFC822)', self.emails[eid])])

    def close(self):
        if self.raise_on_close:
            raise OSError('mailbox already closed')

    def logout(self):
        pass


@pytest.fixture()
def fake_mailbox(zelle_db, monkeypatch):
    """Patch the IMAP layer; returns a setter that installs fixture emails."""
    monkeypatch.setattr(szd.time, 'sleep', lambda seconds: None)

    def install(emails, fail_ids=(), bad_ids=(), raise_on_close=False):
        mail = FakeMail(emails, fail_ids, bad_ids, raise_on_close)
        monkeypatch.setattr(szd, 'connect_to_gmail', lambda: mail)
        monkeypatch.setattr(
            szd, 'search_zelle_emails',
            lambda m, since=None:
                list(emails.keys()) + list(fail_ids) + list(bad_ids))
        return mail

    return install


def test_sync_inserts_pending_rows_and_records_status(zelle_db, fake_mailbox):
    db_session = zelle_db
    fake_mailbox({
        b'1': full_zelle_email(txn='11111111'),
        b'2': full_zelle_email(sender='ALICE WONG', amount='75.00',
                               txn='22222222', memo='Go NewBee'),
    })

    stats = szd.sync_zelle_donations()

    assert stats == {'emails_found': 2, 'parsed': 2, 'duplicates': 0,
                     'inserted': 2, 'errors': 0}

    donors = db_session.query(Donor).order_by(Donor.donation_id).all()
    assert [d.status for d in donors] == ['pending', 'pending']
    assert sorted(d.name for d in donors) == ['Alice Wong', 'John Doe']
    for d in donors:
        assert d.email_excerpt.startswith('Zelle payment received')
        assert d.source == f'Zelle ({d.name})'

    # Non-dry-run records sync health into site_settings
    last_run = db_session.query(SiteSetting).filter(
        SiteSetting.key == 'donation_sync_last_run').first()
    last_result = db_session.query(SiteSetting).filter(
        SiteSetting.key == 'donation_sync_last_result').first()
    assert last_run is not None
    assert json.loads(last_result.value) == stats


def test_sync_respects_explicit_confirmed_status(zelle_db, fake_mailbox):
    db_session = zelle_db
    fake_mailbox({b'1': full_zelle_email(txn='33333333')})

    stats = szd.sync_zelle_donations(status='confirmed')

    assert stats['inserted'] == 1
    donor = db_session.query(Donor).one()
    assert donor.status == 'confirmed'


def test_sync_dedups_by_transaction_number(zelle_db, fake_mailbox):
    db_session = zelle_db
    # Pre-existing donation from an earlier sync
    seed_donation(db_session, 'OLD', notes='Zelle Transaction #99988877')

    fake_mailbox({
        b'1': full_zelle_email(txn='44444444'),
        b'2': full_zelle_email(sender='BOB LEE', txn='44444444'),  # dup in-run
        b'3': full_zelle_email(sender='CARL YU', txn='99988877'),  # dup vs DB
    })

    stats = szd.sync_zelle_donations()

    assert stats == {'emails_found': 3, 'parsed': 3, 'duplicates': 2,
                     'inserted': 1, 'errors': 0}
    names = {d.name for d in db_session.query(Donor).all()}
    assert names == {'Donor OLD', 'John Doe'}


def test_sync_dry_run_inserts_nothing_and_skips_sync_status(zelle_db, fake_mailbox):
    db_session = zelle_db
    fake_mailbox({b'1': full_zelle_email(txn='55555555')})

    stats = szd.sync_zelle_donations(dry_run=True)

    # Stats still report what would be inserted...
    assert stats['inserted'] == 1
    # ...but nothing is written: no donors, no sync-status settings
    assert db_session.query(Donor).count() == 0
    assert db_session.query(SiteSetting).filter(
        SiteSetting.key.in_(['donation_sync_last_run',
                             'donation_sync_last_result'])).count() == 0


def test_sync_counts_parse_skips_and_fetch_errors(zelle_db, fake_mailbox):
    db_session = zelle_db
    fake_mailbox({
        b'1': not_incoming_email(),  # unparseable: skipped, not an error
        b'2': full_zelle_email(txn='66666666'),
    }, fail_ids=(b'9',))  # fetch returns NO: counted as error

    stats = szd.sync_zelle_donations(since_date='2026-01-01')

    assert stats == {'emails_found': 3, 'parsed': 1, 'duplicates': 0,
                     'inserted': 1, 'errors': 1}
    assert db_session.query(Donor).count() == 1


def test_sync_processing_exception_rolls_back_and_counts_error(zelle_db, fake_mailbox):
    db_session = zelle_db
    # bad id: fetch says OK but the payload is garbage -> per-email exception
    fake_mailbox({b'1': full_zelle_email(txn='77777777')}, bad_ids=(b'8',))

    stats = szd.sync_zelle_donations()

    assert stats == {'emails_found': 2, 'parsed': 1, 'duplicates': 0,
                     'inserted': 1, 'errors': 1}
    assert db_session.query(Donor).count() == 1


def test_sync_ignores_mailbox_cleanup_errors(zelle_db, fake_mailbox):
    fake_mailbox({b'1': full_zelle_email(txn='88888888')}, raise_on_close=True)

    stats = szd.sync_zelle_donations()

    assert stats['inserted'] == 1
    assert stats['errors'] == 0


def test_sync_survives_record_sync_status_failure(zelle_db, fake_mailbox, monkeypatch):
    fake_mailbox({b'1': full_zelle_email(txn='10101010')})

    def boom(stats):
        raise RuntimeError('settings table locked')

    monkeypatch.setattr(szd, 'record_sync_status', boom)

    stats = szd.sync_zelle_donations()

    # The sync still returns its stats; the warning path swallows the error
    assert stats['inserted'] == 1
    assert stats['errors'] == 0


def test_sync_connection_failure_counts_error_but_returns(zelle_db, monkeypatch):
    db_session = zelle_db

    def boom():
        raise ValueError('GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env')

    monkeypatch.setattr(szd, 'connect_to_gmail', boom)

    stats = szd.sync_zelle_donations()

    assert stats == {'emails_found': 0, 'parsed': 0, 'duplicates': 0,
                     'inserted': 0, 'errors': 1}
    # Failure runs are still recorded for the ledger health display
    assert db_session.query(SiteSetting).filter(
        SiteSetting.key == 'donation_sync_last_run').count() == 1


# ---------------------------------------------------------------------------
# fetch_historical_data.generate_event_code
# ---------------------------------------------------------------------------

def test_brooklyn_half_code_switches_in_2025():
    assert fetch_historical_data.generate_event_code('BKH', 2024) == '24BKH'
    assert fetch_historical_data.generate_event_code('BKH', 2025) == 'B2025'
    assert fetch_historical_data.generate_event_code('BKH', 2026) == 'B2026'


def test_marathon_and_half_use_full_year_codes():
    assert fetch_historical_data.generate_event_code('M', 2024) == 'M2024'
    assert fetch_historical_data.generate_event_code('H', 2025) == 'H2025'


def test_standard_codes_keep_two_digit_year_prefix():
    assert fetch_historical_data.generate_event_code('QUEENS', 2026) == '26QUEENS'
    assert fetch_historical_data.generate_event_code('BX10M', 2019) == '19BX10M'


# ---------------------------------------------------------------------------
# migrate_donation_ledger
# ---------------------------------------------------------------------------

def scratch_engine(create_sql, seed_sql=()):
    eng = create_engine('sqlite://', connect_args={'check_same_thread': False},
                        poolclass=StaticPool)
    with eng.begin() as conn:
        conn.execute(text(create_sql))
        for stmt in seed_sql:
            conn.execute(text(stmt))
    return eng


LEGACY_DONORS_TABLE = """
    CREATE TABLE donors (
        donation_id INTEGER PRIMARY KEY AUTOINCREMENT,
        donor_id VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        donor_type VARCHAR(20) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL
    )
"""


def test_migrate_adds_columns_and_is_idempotent(monkeypatch, capsys):
    eng = scratch_engine(LEGACY_DONORS_TABLE, [
        "INSERT INTO donors (donor_id, name, donor_type, amount)"
        " VALUES ('D1', 'Old Donor', 'individual', 100)",
    ])
    monkeypatch.setattr(migrate_donation_ledger, 'engine', eng)

    migrate_donation_ledger.migrate()

    columns = {c['name'] for c in inspect(eng).get_columns('donors')}
    assert {'status', 'thank_you_sent_at', 'email_excerpt'} <= columns

    with eng.connect() as conn:
        row = conn.execute(text(
            "SELECT status, thank_you_sent_at, email_excerpt FROM donors")).one()
    assert row.status == 'confirmed'  # default applied to pre-existing row
    assert row.thank_you_sent_at is None
    assert row.email_excerpt is None

    # Re-run: skips existing columns without raising
    migrate_donation_ledger.migrate()
    out = capsys.readouterr().out
    assert 'already exists, skipping' in out
    columns_after = {c['name'] for c in inspect(eng).get_columns('donors')}
    assert columns_after == columns


def test_migrate_backfills_null_statuses(monkeypatch, capsys):
    # Simulate a partial run: status column exists but has NULLs
    eng = scratch_engine(
        """
        CREATE TABLE donors (
            donation_id INTEGER PRIMARY KEY AUTOINCREMENT,
            donor_id VARCHAR(50) NOT NULL,
            name VARCHAR(255) NOT NULL,
            donor_type VARCHAR(20) NOT NULL,
            amount DECIMAL(10, 2) NOT NULL,
            status VARCHAR(20)
        )
        """,
        [
            "INSERT INTO donors (donor_id, name, donor_type, amount, status)"
            " VALUES ('D1', 'Null Status', 'individual', 100, NULL)",
            "INSERT INTO donors (donor_id, name, donor_type, amount, status)"
            " VALUES ('D2', 'Pending Kept', 'individual', 50, 'pending')",
        ],
    )
    monkeypatch.setattr(migrate_donation_ledger, 'engine', eng)

    migrate_donation_ledger.migrate()

    out = capsys.readouterr().out
    assert "Backfilled status='confirmed' on 1 row(s)." in out

    with eng.connect() as conn:
        rows = dict(conn.execute(
            text("SELECT donor_id, status FROM donors")).all())
    assert rows == {'D1': 'confirmed', 'D2': 'pending'}
    columns = {c['name'] for c in inspect(eng).get_columns('donors')}
    assert {'thank_you_sent_at', 'email_excerpt'} <= columns
