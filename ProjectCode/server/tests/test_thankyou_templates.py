"""Tests for thank-you templates (tiered by amount), letter preview/send
with edits + receipt attachment, and the donation receipt PDF."""
from datetime import date

from database import Donor, ThankYouTemplate
from tests.conftest import auth


def seed_donation(db_session, donor_id='D001', **overrides):
    defaults = dict(
        donor_id=donor_id,
        name=f'Donor {donor_id}',
        donor_type='individual',
        donation_event='General Support',
        amount=100,
        donation_date=date(2026, 7, 3),
        status='confirmed',
        source='Zelle (Test Donor)',
    )
    defaults.update(overrides)
    donor = Donor(**defaults)
    db_session.add(donor)
    db_session.commit()
    db_session.refresh(donor)
    return donor


def seed_template(db_session, name='Standard', min_amount=0,
                  subject='Thanks {name}!', body='Dear {name}, thanks for {amount} on {date}.'):
    template = ThankYouTemplate(name=name, min_amount=min_amount,
                                subject=subject, body=body)
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)
    return template


# ---------------------------------------------------------------- CRUD

def test_templates_require_auth(client):
    assert client.get('/api/donors/thank-you-templates').status_code == 401
    assert client.post('/api/donors/thank-you-templates', json={}).status_code == 401


def test_template_crud_roundtrip(client, committee_member):
    created = client.post('/api/donors/thank-you-templates', json={
        'name': 'Major donor', 'min_amount': '300',
        'subject': 'Your generous gift', 'body': 'Dear {name}, ...',
    }, headers=auth(committee_member))
    assert created.status_code == 200
    template_id = created.json()['id']

    listed = client.get('/api/donors/thank-you-templates',
                        headers=auth(committee_member)).json()
    assert [t['name'] for t in listed] == ['Major donor']

    updated = client.put(f'/api/donors/thank-you-templates/{template_id}',
                         json={'min_amount': '500'}, headers=auth(committee_member))
    assert float(updated.json()['min_amount']) == 500.0

    deleted = client.delete(f'/api/donors/thank-you-templates/{template_id}',
                            headers=auth(committee_member))
    assert deleted.status_code == 200
    assert client.get('/api/donors/thank-you-templates',
                      headers=auth(committee_member)).json() == []


def test_template_update_delete_404(client, committee_member):
    assert client.put('/api/donors/thank-you-templates/999', json={'name': 'x'},
                      headers=auth(committee_member)).status_code == 404
    assert client.delete('/api/donors/thank-you-templates/999',
                         headers=auth(committee_member)).status_code == 404


def test_templates_sorted_by_tier(client, db_session, committee_member):
    seed_template(db_session, 'Major', min_amount=1000)
    seed_template(db_session, 'Standard', min_amount=0)
    listed = client.get('/api/donors/thank-you-templates',
                        headers=auth(committee_member)).json()
    assert [t['name'] for t in listed] == ['Standard', 'Major']


# ---------------------------------------------------------------- tier matching

def test_preview_matches_highest_tier_at_or_below_amount(client, db_session, committee_member):
    seed_template(db_session, 'Standard', min_amount=0)
    seed_template(db_session, 'Mid', min_amount=300)
    seed_template(db_session, 'Major', min_amount=1000)

    d20 = seed_donation(db_session, 'D20', amount=20)
    d300 = seed_donation(db_session, 'D300', amount=300)
    d999 = seed_donation(db_session, 'D999', amount=999)
    d5000 = seed_donation(db_session, 'D5000', amount=5000)

    def preview_name(d):
        return client.get(f'/api/donors/donations/{d.donation_id}/thank-you-preview',
                          headers=auth(committee_member)).json()['template_name']

    assert preview_name(d20) == 'Standard'
    assert preview_name(d300) == 'Mid'
    assert preview_name(d999) == 'Mid'
    assert preview_name(d5000) == 'Major'


def test_preview_renders_placeholders(client, db_session, committee_member):
    seed_template(db_session, 'Standard', min_amount=0,
                  subject='Thanks {name}!',
                  body='Dear {name}, thanks for {amount} on {date}.')
    donor = seed_donation(db_session, 'D1', name='Yue Ma', amount=500,
                          donation_date=date(2026, 6, 4))

    preview = client.get(f'/api/donors/donations/{donor.donation_id}/thank-you-preview',
                         headers=auth(committee_member)).json()
    assert preview['subject'] == 'Thanks Yue Ma!'
    assert preview['body'] == 'Dear Yue Ma, thanks for $500.00 on June 04, 2026.'
    assert preview['template_name'] == 'Standard'


def test_preview_falls_back_to_builtin_without_templates(client, db_session, committee_member):
    donor = seed_donation(db_session, 'D1')
    preview = client.get(f'/api/donors/donations/{donor.donation_id}/thank-you-preview',
                         headers=auth(committee_member)).json()
    assert preview['template_name'] is None
    assert preview['template_id'] == 0
    assert '新蜂跑团' in preview['body']


def test_preview_with_explicit_template_id(client, db_session, committee_member):
    """Committee can override the auto-match and pick any template."""
    seed_template(db_session, 'Standard', min_amount=0)
    major = seed_template(db_session, 'Major', min_amount=1000,
                          subject='Major thanks {name}', body='Major body {amount}')
    donor = seed_donation(db_session, 'D1', name='Kevin Gu', amount=15)

    # Auto-match picks Standard for $15...
    auto = client.get(f'/api/donors/donations/{donor.donation_id}/thank-you-preview',
                      headers=auth(committee_member)).json()
    assert auto['template_name'] == 'Standard'

    # ...but an explicit template_id renders the chosen one
    picked = client.get(
        f'/api/donors/donations/{donor.donation_id}/thank-you-preview',
        params={'template_id': major.id}, headers=auth(committee_member)).json()
    assert picked['template_name'] == 'Major'
    assert picked['template_id'] == major.id
    assert picked['subject'] == 'Major thanks Kevin Gu'
    assert picked['body'] == 'Major body $15.00'

    # template_id=0 explicitly requests the built-in default
    builtin = client.get(
        f'/api/donors/donations/{donor.donation_id}/thank-you-preview',
        params={'template_id': 0}, headers=auth(committee_member)).json()
    assert builtin['template_name'] is None
    assert '新蜂跑团' in builtin['body']


def test_preview_unknown_template_404(client, db_session, committee_member):
    donor = seed_donation(db_session, 'D1')
    resp = client.get(
        f'/api/donors/donations/{donor.donation_id}/thank-you-preview',
        params={'template_id': 999}, headers=auth(committee_member))
    assert resp.status_code == 404


# ---------------------------------------------------------------- send with edits + receipt

def _capture_send(monkeypatch):
    import email_service
    sent = {}

    def fake_send(to_email, subject, body_html, body_text=None, attachments=None):
        sent.update(to=to_email, subject=subject, html=body_html,
                    text=body_text, attachments=attachments)
        return True

    monkeypatch.setattr(email_service.EmailService, 'send_email',
                        staticmethod(fake_send))
    return sent


def test_send_uses_matched_template(client, db_session, committee_member, monkeypatch):
    sent = _capture_send(monkeypatch)
    seed_template(db_session, 'Standard', min_amount=0)
    donor = seed_donation(db_session, 'D1', name='Kevin Gu', amount=15)

    resp = client.post(f'/api/donors/donations/{donor.donation_id}/send-thank-you',
                       json={'email': 'kevin@example.com'},
                       headers=auth(committee_member))
    assert resp.status_code == 200
    assert sent['subject'] == 'Thanks Kevin Gu!'
    assert sent['attachments'] is None


def test_send_honors_edited_subject_and_message(client, db_session, committee_member, monkeypatch):
    sent = _capture_send(monkeypatch)
    donor = seed_donation(db_session, 'D1')

    resp = client.post(
        f'/api/donors/donations/{donor.donation_id}/send-thank-you',
        json={'email': 'donor@example.com', 'subject': 'Custom subject',
              'message': 'Custom letter body.\nSecond line.'},
        headers=auth(committee_member))
    assert resp.status_code == 200
    assert sent['subject'] == 'Custom subject'
    assert sent['text'] == 'Custom letter body.\nSecond line.'
    assert 'Custom letter body.' in sent['html']
    # Ack in notes records what was actually sent
    notes = resp.json()['notes']
    assert 'Subject: Custom subject' in notes
    assert 'Custom letter body.' in notes


def test_send_attaches_receipt_pdf(client, db_session, committee_member, monkeypatch):
    sent = _capture_send(monkeypatch)
    donor = seed_donation(db_session, 'D1', name='Test Donor',
                          donation_date=date(2026, 7, 3))

    resp = client.post(
        f'/api/donors/donations/{donor.donation_id}/send-thank-you',
        json={'email': 'donor@example.com', 'attach_receipt': True},
        headers=auth(committee_member))
    assert resp.status_code == 200
    (filename, content, subtype), = sent['attachments']
    assert filename == 'NewBee_Donation_Receipt_20260703_Test_Donor.pdf'
    assert content.startswith(b'%PDF')
    assert subtype == 'pdf'
    assert 'Attachment 附件: NewBee_Donation_Receipt_20260703_Test_Donor.pdf' in resp.json()['notes']


# ---------------------------------------------------------------- receipt endpoint

def test_receipt_requires_auth(client, db_session):
    donor = seed_donation(db_session, 'D1')
    resp = client.get(f'/api/donors/donations/{donor.donation_id}/receipt')
    assert resp.status_code == 401


def test_receipt_unknown_donation_404(client, committee_member):
    resp = client.get('/api/donors/donations/999/receipt',
                      headers=auth(committee_member))
    assert resp.status_code == 404


def test_receipt_rejects_unconfirmed(client, db_session, committee_member):
    donor = seed_donation(db_session, 'P1', status='pending')
    resp = client.get(f'/api/donors/donations/{donor.donation_id}/receipt',
                      headers=auth(committee_member))
    assert resp.status_code == 400


def test_receipt_pdf_download(client, db_session, committee_member):
    donor = seed_donation(db_session, 'D1', name='Golden Wheat Bakery',
                          amount=800, donation_date=date(2025, 6, 1),
                          source='WeChat')
    resp = client.get(f'/api/donors/donations/{donor.donation_id}/receipt',
                      headers=auth(committee_member))
    assert resp.status_code == 200
    assert resp.headers['content-type'] == 'application/pdf'
    assert 'NewBee_Donation_Receipt_20250601_Golden_Wheat_Bakery.pdf' in \
        resp.headers['content-disposition']
    assert resp.content.startswith(b'%PDF')


def test_receipt_method_strips_payer_name(db_session):
    from routes.donors import _payment_method
    assert _payment_method(seed_donation(db_session, 'A', source='Zelle (Li Chen)')) == 'Zelle'
    assert _payment_method(seed_donation(db_session, 'B', source='Venmo')) == 'Venmo'
    assert _payment_method(seed_donation(db_session, 'C', source=None)) == '—'
