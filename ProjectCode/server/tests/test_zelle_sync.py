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


# ---------------------------------------------------------------- venmo

def make_venmo_email(sender='Xiao Yang', amount='$15.00',
                     memo='拉什福德贝林莱斯加油 凯恩进球 英格兰过关西瓜',
                     txn_link='https://venmo.com/story/4236712345',
                     txn_text=None,
                     message_id='<venmo-abc-123@venmo.com>'):
    """Mirror the real Venmo email text structure: duplicated title/preheader
    line, card heading, amount split across lines, note, button, details."""
    link_html = f'<a href="{txn_link}">See transaction</a>' if txn_link else ''
    txn_html = (
        f'<p>Transaction details</p><p>Date</p><p>Jul 05, 2026</p>'
        f'<p>Transaction ID</p><p>{txn_text}</p>'
        if txn_text else ''
    )
    html = f"""
    <html><body>
      <p>{sender} paid you {amount} {sender} paid you {amount}</p>
      <p>venmo</p>
      <p>{sender} paid you</p>
      <p>$</p><p>15</p><p>. 00</p>
      <p>{memo}</p>
      {link_html}
      <p>Money credited to your Venmo account.</p>
      {txn_html}
      <p>For any issues, please contact us at Help Center.</p>
    </body></html>
    """
    msg = MIMEText(html, 'html', 'utf-8')
    msg['From'] = 'Venmo <venmo@venmo.com>'
    msg['Subject'] = f'{sender} paid you {amount}'
    msg['Date'] = 'Sun, 05 Jul 2026 19:49:00 -0400'
    if message_id:
        msg['Message-ID'] = message_id
    return msg.as_bytes()


def test_parse_venmo_email_extracts_all_fields():
    parsed = zelle.parse_venmo_email(make_venmo_email())
    assert parsed['sender_name'] == 'Xiao Yang'
    assert parsed['amount'] == Decimal('15.00')
    assert parsed['donation_date'] == date(2026, 7, 5)
    assert parsed['transaction_number'] == '4236712345'
    assert '拉什福德' in parsed['memo']


def test_parse_venmo_email_title_line_does_not_leak_into_memo():
    parsed = zelle.parse_venmo_email(make_venmo_email(memo='red tee'))
    # The duplicated "X paid you $15.00" preheader and the split amount
    # fragments must not appear in the note
    assert parsed['memo'] == 'red tee'


def test_parse_venmo_email_prefers_transaction_id_field():
    parsed = zelle.parse_venmo_email(make_venmo_email(
        txn_text='4611697894323507636'))
    assert parsed['transaction_number'] == '4611697894323507636'


def test_parse_venmo_email_falls_back_to_message_id_for_dedup():
    parsed = zelle.parse_venmo_email(make_venmo_email(txn_link=None))
    assert parsed['transaction_number'] == 'venmo-abc-123@venmo.com'


def test_parse_venmo_email_no_dedup_key_at_all():
    parsed = zelle.parse_venmo_email(make_venmo_email(txn_link=None, message_id=None))
    assert parsed['transaction_number'] is None


def test_parse_venmo_email_rejects_outgoing_payment():
    msg = MIMEText('<p>details</p>', 'html', 'utf-8')
    msg['Subject'] = 'You paid Xiao Yang $15.00'
    assert zelle.parse_venmo_email(msg.as_bytes()) is None


def test_parse_venmo_email_inline_memo_same_line_as_paid_you():
    # Real Venmo HTML renders "{NAME} paid you {note}" inline in one block
    html = """
    <html><body>
      <div>Hamilton Chen paid you ⛽ 加油</div>
      <div>$15.00</div>
      <a href="https://venmo.com/story/4611697894995121599">See transaction</a>
      <div>Money credited to your Venmo account.</div>
    </body></html>
    """
    msg = MIMEText(html, 'html', 'utf-8')
    msg['Subject'] = 'Hamilton Chen paid you $15.00'
    msg['Date'] = 'Wed, 03 Jun 2026 10:00:00 -0400'
    parsed = zelle.parse_venmo_email(msg.as_bytes())
    assert parsed['memo'] == '⛽ 加油'
    assert parsed['transaction_number'] == '4611697894995121599'


def test_parse_venmo_email_without_memo():
    parsed = zelle.parse_venmo_email(make_venmo_email(memo=''))
    assert parsed['memo'] is None
    assert parsed['amount'] == Decimal('15.00')


def test_parse_venmo_email_encoded_subject():
    raw = make_venmo_email()
    # Re-encode the subject as RFC 2047 UTF-8 (how Gmail delivers CJK names)
    import email as email_mod
    from email.header import Header
    msg = email_mod.message_from_bytes(raw)
    del msg['Subject']
    msg['Subject'] = Header('王小 paid you $88.00', 'utf-8')
    parsed = zelle.parse_venmo_email(msg.as_bytes())
    assert parsed['sender_name'] == '王小'
    assert parsed['amount'] == Decimal('88.00')


def test_build_donor_record_venmo_provider_strings():
    parsed = zelle.parse_venmo_email(make_venmo_email())
    record = zelle.build_donor_record(parsed, provider='Venmo')
    assert record['status'] == 'pending'
    assert record['source'] == 'Venmo (Xiao Yang)'
    assert record['notes'] == 'Venmo Transaction #4236712345'
    assert record['email_excerpt'].startswith(
        'Venmo payment received — Xiao Yang sent you $15.00')


def test_sync_processes_both_zelle_and_venmo(db_session, monkeypatch):
    from sqlalchemy.orm import sessionmaker as _sessionmaker

    class FakeMail:
        def __init__(self, zelle_emails, venmo_emails):
            self.emails = {**zelle_emails, **venmo_emails}
            self.selected = []

        def select(self, folder, readonly=False):
            self.selected.append(folder)
            return ('OK', [b''])

        def fetch(self, eid, spec):
            return ('OK', [(b'1 (RFC822)', self.emails[eid])])

        def close(self):
            pass

        def logout(self):
            pass

    zelle_emails = {b'z1': make_zelle_email()}
    venmo_emails = {b'v1': make_venmo_email()}
    mail = FakeMail(zelle_emails, venmo_emails)

    monkeypatch.setattr(zelle, 'Session', _sessionmaker(bind=db_session.get_bind()))
    monkeypatch.setattr(zelle.time, 'sleep', lambda seconds: None)
    monkeypatch.setattr(zelle, 'connect_to_gmail', lambda: mail)
    monkeypatch.setattr(zelle, 'search_zelle_emails',
                        lambda m, since=None: list(zelle_emails.keys()))
    monkeypatch.setattr(zelle, 'search_venmo_emails',
                        lambda m, since=None: list(venmo_emails.keys()))

    stats = zelle.sync_zelle_donations()

    assert stats == {'emails_found': 2, 'parsed': 2, 'duplicates': 0,
                     'inserted': 2, 'errors': 0}
    assert zelle.VENMO_FOLDER in mail.selected
    donors = {d.name: d for d in db_session.query(Donor).all()}
    assert set(donors) == {'Ming Zhao', 'Xiao Yang'}
    assert donors['Xiao Yang'].source == 'Venmo (Xiao Yang)'
    assert donors['Xiao Yang'].status == 'pending'
    assert donors['Ming Zhao'].source == 'Zelle (Ming Zhao)'


def test_sync_skips_venmo_when_folder_missing(db_session, monkeypatch):
    from sqlalchemy.orm import sessionmaker as _sessionmaker

    class NoVenmoMail:
        def select(self, folder, readonly=False):
            return ('NO', [b''])

        def close(self):
            pass

        def logout(self):
            pass

    monkeypatch.setattr(zelle, 'Session', _sessionmaker(bind=db_session.get_bind()))
    monkeypatch.setattr(zelle, 'connect_to_gmail', lambda: NoVenmoMail())
    monkeypatch.setattr(zelle, 'search_zelle_emails', lambda m, since=None: [])

    stats = zelle.sync_zelle_donations()
    assert stats['emails_found'] == 0
    assert stats['errors'] == 0


# ---------------------------------------------------------------- auto-ignore

def test_auto_ignore_keyword_matches_carpool_and_gear():
    assert zelle.auto_ignore_keyword('拼车 nuo chen') == '拼车'
    assert zelle.auto_ignore_keyword('Bear Mountain Carpool for Tiffany') == 'carpool'
    assert zelle.auto_ignore_keyword('熊山车费') == '车费'
    assert zelle.auto_ignore_keyword('🚗') == '🚗'
    assert zelle.auto_ignore_keyword('1 red + 1 white 队服') == '队服'
    assert zelle.auto_ignore_keyword('newbee white t-shirt') == 't-shirt'
    assert zelle.auto_ignore_keyword('TEE red') == 'tee'


def test_auto_ignore_keyword_leaves_real_donations_alone():
    assert zelle.auto_ignore_keyword('Happy 10th anniversary!') is None
    assert zelle.auto_ignore_keyword('梅老板加油 🇦🇷') is None
    assert zelle.auto_ignore_keyword('英格兰过关西瓜🍉') is None
    assert zelle.auto_ignore_keyword(None) is None
    assert zelle.auto_ignore_keyword('') is None


def test_sync_auto_ignores_carpool_payments(db_session, monkeypatch):
    from sqlalchemy.orm import sessionmaker as _sessionmaker

    class FakeMail:
        def __init__(self, emails):
            self.emails = emails

        def select(self, folder, readonly=False):
            return ('OK', [b''])

        def fetch(self, eid, spec):
            return ('OK', [(b'1 (RFC822)', self.emails[eid])])

        def close(self):
            pass

        def logout(self):
            pass

    venmo_emails = {
        b'v1': make_venmo_email(sender='Ryan Young', memo='拼车费用',
                                txn_link='https://venmo.com/story/111'),
        b'v2': make_venmo_email(sender='Yue Ma', memo='Happy 10th anniversary!',
                                txn_link='https://venmo.com/story/222'),
    }
    monkeypatch.setattr(zelle, 'Session', _sessionmaker(bind=db_session.get_bind()))
    monkeypatch.setattr(zelle.time, 'sleep', lambda seconds: None)
    monkeypatch.setattr(zelle, 'connect_to_gmail', lambda: FakeMail(venmo_emails))
    monkeypatch.setattr(zelle, 'search_zelle_emails', lambda m, since=None: [])
    monkeypatch.setattr(zelle, 'search_venmo_emails',
                        lambda m, since=None: list(venmo_emails.keys()))

    # Even a confirmed backfill must not publish a carpool fee
    stats = zelle.sync_zelle_donations(status='confirmed')
    assert stats['inserted'] == 2

    donors = {d.name: d for d in db_session.query(Donor).all()}
    assert donors['Ryan Young'].status == 'dismissed'
    assert donors['Ryan Young'].income_type == 'pass_through'
    assert "Auto-ignored 自动忽略: memo matched '拼车'" in donors['Ryan Young'].notes
    assert donors['Yue Ma'].status == 'confirmed'
    assert donors['Yue Ma'].income_type is None
    assert 'Auto-ignored' not in donors['Yue Ma'].notes


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
