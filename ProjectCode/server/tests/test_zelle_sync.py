"""Tests for the Zelle donation email parser and record builder
(sync_zelle_donations.py). The IMAP flow itself is exercised via the
/api/donors/sync-gmail route tests with the sync function mocked."""
import json
from datetime import date
from decimal import Decimal
from email.mime.text import MIMEText

from sqlalchemy.orm import sessionmaker

import sync_zelle_donations as zelle
from database import Donor, SiteSetting


def make_zelle_email(sender='MING ZHAO', amount='$150.00', sent_on='Jul 8, 2026',
                     txn='23456789012', memo='Keep running!'):
    html = f"""
    <html><body>
      <style>.x{{color:red}}</style>
      <p>{sender} sent you money with Zelle&reg;</p>
      <p>Amount</p><p>{amount}</p>
      <p>Sent on</p><p>{sent_on}</p>
      <p>Transaction number</p><p>{txn}</p>
      <p>Memo</p><p>{memo}</p>
      <p>{sender.title()} is registered with Zelle.</p>
    </body></html>
    """
    msg = MIMEText(html, 'html', 'utf-8')
    msg['From'] = 'no.reply.alerts@chase.com'
    msg['Subject'] = f'You received money with Zelle from {sender}'
    msg['Date'] = 'Wed, 08 Jul 2026 18:42:00 -0400'
    return msg.as_bytes()


# ---------------------------------------------------------------- strip_html

def test_strip_html_removes_tags_styles_and_decodes_entities():
    html = '<style>.a{color:red}</style><p>Li &amp; Chen</p><br><div>next</div>'
    text = zelle.strip_html(html)
    assert 'color:red' not in text
    assert 'Li & Chen' in text
    assert '\n' in text  # block elements become newlines


# ---------------------------------------------------------------- parse

def test_parse_zelle_email_extracts_all_fields():
    parsed = zelle.parse_zelle_email(make_zelle_email())
    assert parsed['sender_name'] == 'Ming Zhao'
    assert parsed['amount'] == Decimal('150.00')
    assert parsed['donation_date'] == date(2026, 7, 8)
    assert parsed['transaction_number'] == '23456789012'
    assert parsed['memo'] == 'Keep running!'


def test_parse_zelle_email_ignores_outgoing_payment():
    html = '<p>You sent money to LI CHEN with Zelle</p>'
    msg = MIMEText(html, 'html', 'utf-8')
    assert zelle.parse_zelle_email(msg.as_bytes()) is None


def test_parse_zelle_email_falls_back_to_date_header():
    parsed = zelle.parse_zelle_email(make_zelle_email(sent_on='someday'))
    # Falls back to the email Date header (Jul 8, 2026 local time)
    assert parsed['donation_date'] == date(2026, 7, 8)


def test_parse_zelle_email_na_memo_ignored():
    parsed = zelle.parse_zelle_email(make_zelle_email(memo='N/A'))
    assert parsed['memo'] is None


# ---------------------------------------------------------------- record builder

def test_build_donor_record_defaults_to_pending_with_excerpt():
    parsed = zelle.parse_zelle_email(make_zelle_email())
    record = zelle.build_donor_record(parsed)
    assert record['status'] == 'pending'
    assert record['donor_type'] == 'individual'
    assert record['receipt_confirmed'] is True
    assert record['notes'] == 'Zelle Transaction #23456789012'
    assert 'Ming Zhao sent you $150.00' in record['email_excerpt']
    assert 'Memo: Keep running!' in record['email_excerpt']
    assert 'Transaction #23456789012' in record['email_excerpt']


def test_build_donor_record_confirmed_status_for_backfill():
    parsed = zelle.parse_zelle_email(make_zelle_email())
    record = zelle.build_donor_record(parsed, status='confirmed')
    assert record['status'] == 'confirmed'


def test_build_email_excerpt_without_optional_fields():
    excerpt = zelle.build_email_excerpt({
        'sender_name': 'Li Chen',
        'amount': Decimal('88'),
        'donation_date': None,
        'transaction_number': None,
        'memo': None,
    })
    assert excerpt == 'Zelle payment received — Li Chen sent you $88'


# ---------------------------------------------------------------- dedup + sync status

def test_is_duplicate_matches_transaction_number(db_session):
    db_session.add(Donor(
        donor_id='IND_1', name='Li Chen', donor_type='individual', amount=100,
        notes='Zelle Transaction #555000111',
    ))
    db_session.commit()

    assert zelle.is_duplicate(db_session, '555000111') is True
    assert zelle.is_duplicate(db_session, '999999999') is False
    assert zelle.is_duplicate(db_session, None) is False


def test_record_sync_status_writes_and_updates_settings(db_session, monkeypatch):
    # Bind the script's session factory to the same in-memory test engine
    monkeypatch.setattr(zelle, 'Session', sessionmaker(bind=db_session.get_bind()))

    stats = {'emails_found': 3, 'parsed': 3, 'duplicates': 1, 'inserted': 2, 'errors': 0}
    zelle.record_sync_status(stats)

    last_run = db_session.query(SiteSetting).filter(
        SiteSetting.key == 'donation_sync_last_run').first()
    last_result = db_session.query(SiteSetting).filter(
        SiteSetting.key == 'donation_sync_last_result').first()
    assert last_run is not None
    assert json.loads(last_result.value)['inserted'] == 2

    # Second run updates the same rows instead of duplicating them
    zelle.record_sync_status({**stats, 'inserted': 5})
    rows = db_session.query(SiteSetting).filter(
        SiteSetting.key == 'donation_sync_last_result').all()
    db_session.expire_all()
    assert len(rows) == 1
    assert json.loads(rows[0].value)['inserted'] == 5
