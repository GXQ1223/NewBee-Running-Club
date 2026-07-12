"""Tests for the finance module (Books Grid): categories, two-layer income
classification, expenses + Chase CSV import, donor directory, batch
acknowledgments, reports, year-end statements, settings."""
import json
from datetime import date, datetime

from database import Donor, DonorDirectoryEntry, Expense, FinanceCategory, SiteSetting
from tests.conftest import auth


def seed_categories(db_session):
    for kind, code, name in [
        ("event", 1001, "General"), ("event", 1003, "NewBee Anniversary"),
        ("event", 1004, "Bear Mt. Run"),
        ("income_type", 2001, "Donation"),
        ("expense", 5001, "Event Food & Drink"), ("expense", 5002, "Event Supplies"),
    ]:
        db_session.add(FinanceCategory(kind=kind, code=code, name=name))
    db_session.commit()


def seed_income(db_session, donor_id="D1", **overrides):
    defaults = dict(
        donor_id=donor_id, name=f"Donor {donor_id}", donor_type="individual",
        amount=100, donation_date=date(2026, 6, 1), status="confirmed",
        income_type="donation", event_code=1001, source="Zelle (X)",
        donation_event="General Support",
    )
    defaults.update(overrides)
    donor = Donor(**defaults)
    db_session.add(donor)
    db_session.commit()
    db_session.refresh(donor)
    return donor


def seed_expense(db_session, **overrides):
    defaults = dict(expense_date=date(2026, 6, 2), vendor="COSTCO", amount=100,
                    method="Debit Card", bank_description="COSTCO WHSE",
                    event_code=1003, expense_category_code=5001,
                    import_id=f"BANK|test|{overrides.get('vendor','COSTCO')}|{overrides.get('amount',100)}")
    defaults.update(overrides)
    expense = Expense(**defaults)
    db_session.add(expense)
    db_session.commit()
    db_session.refresh(expense)
    return expense


# ---------------------------------------------------------------- categories

def test_categories_require_auth(client):
    assert client.get("/api/finance/categories").status_code == 401


def test_categories_grouped_by_kind(client, db_session, committee_member):
    seed_categories(db_session)
    body = client.get("/api/finance/categories", headers=auth(committee_member)).json()
    assert [c["code"] for c in body["events"]] == [1001, 1003, 1004]
    assert body["income_types"][0]["name"] == "Donation"
    assert len(body["expenses"]) == 2


def test_create_category_auto_assigns_next_code(client, db_session, committee_member):
    seed_categories(db_session)
    resp = client.post("/api/finance/categories",
                       json={"kind": "event", "name": "Queens 10K"},
                       headers=auth(committee_member))
    assert resp.status_code == 200
    assert resp.json()["code"] == 1005  # after 1004


def test_create_category_first_of_kind_starts_range(client, committee_member):
    resp = client.post("/api/finance/categories",
                       json={"kind": "expense", "name": "Space Rental"},
                       headers=auth(committee_member))
    assert resp.json()["code"] == 5001


def test_create_category_duplicate_code_400(client, db_session, committee_member):
    seed_categories(db_session)
    resp = client.post("/api/finance/categories",
                       json={"kind": "event", "name": "Dup", "code": 1001},
                       headers=auth(committee_member))
    assert resp.status_code == 400


def test_update_category_and_404(client, db_session, committee_member):
    seed_categories(db_session)
    row = db_session.query(FinanceCategory).filter_by(code=1004).first()
    resp = client.put(f"/api/finance/categories/{row.id}",
                      json={"name": "Bear Mountain Run"},
                      headers=auth(committee_member))
    assert resp.json()["name"] == "Bear Mountain Run"
    assert client.put("/api/finance/categories/999", json={"name": "x"},
                      headers=auth(committee_member)).status_code == 404


# ---------------------------------------------------------------- income

def test_income_lists_unclassified_first(client, db_session, committee_member):
    seed_income(db_session, "C1")
    seed_income(db_session, "U1", income_type=None, status="pending",
                donation_date=date(2026, 7, 1))
    rows = client.get("/api/finance/income", headers=auth(committee_member)).json()
    assert rows[0]["donor_id"] == "U1"
    assert rows[0]["income_type"] is None
    assert rows[1]["income_type"] == "donation"


def test_classify_income_bulk_sets_type_event_and_status(client, db_session, committee_member):
    a = seed_income(db_session, "A", income_type=None, status="pending")
    b = seed_income(db_session, "B", income_type=None, status="pending")
    resp = client.post("/api/finance/income/classify", json={
        "donation_ids": [a.donation_id, b.donation_id],
        "income_type": "pass_through", "event_code": 1004,
    }, headers=auth(committee_member))
    assert resp.json() == {"updated": 2}
    db_session.expire_all()
    for row in (a, b):
        db_session.refresh(row)
        assert row.income_type == "pass_through"
        assert row.event_code == 1004
        assert row.status == "dismissed"  # not public


def test_classify_income_donation_publishes(client, db_session, committee_member):
    a = seed_income(db_session, "A", income_type=None, status="pending")
    client.post("/api/finance/income/classify", json={
        "donation_ids": [a.donation_id], "income_type": "donation",
    }, headers=auth(committee_member))
    public = client.get("/api/donors/public").json()
    assert [d["donor_id"] for d in public] == ["A"]
    db_session.refresh(a)
    assert a.event_code == 1001  # defaulted to General


def test_classify_income_unknown_id_404(client, committee_member):
    resp = client.post("/api/finance/income/classify", json={
        "donation_ids": [999], "income_type": "pass_through",
    }, headers=auth(committee_member))
    assert resp.status_code == 404


def test_manual_income_row(client, committee_member):
    resp = client.post("/api/finance/income/manual", json={
        "name": "Cash Jar", "amount": "88.00", "donation_date": "2026-07-01",
        "method": "Cash", "memo": "gala box", "income_type": "event_revenue",
        "event_code": 1003,
    }, headers=auth(committee_member))
    body = resp.json()
    assert body["income_type"] == "event_revenue"
    assert body["status"] == "dismissed"
    assert body["donor_id"].startswith("MAN_")


def test_legacy_ledger_actions_sync_income_type(client, db_session, committee_member):
    """The old ledger's approve/ignore/revert keep the finance books in sync."""
    row = seed_income(db_session, "P1", income_type=None, status="pending")

    client.post(f"/api/donors/donations/{row.donation_id}/approve", json={},
                headers=auth(committee_member))
    db_session.refresh(row)
    assert row.income_type == "donation"
    assert row.event_code == 1001

    client.post(f"/api/donors/donations/{row.donation_id}/dismiss",
                headers=auth(committee_member))
    db_session.refresh(row)
    assert row.income_type is None  # ignored donation returns to unclassified

    client.post(f"/api/donors/donations/{row.donation_id}/revert",
                headers=auth(committee_member))
    db_session.refresh(row)
    assert row.income_type is None  # back to unclassified


def test_legacy_dismiss_preserves_finance_classification(client, db_session, committee_member):
    row = seed_income(db_session, "P1", income_type="pass_through", status="confirmed")
    client.post(f"/api/donors/donations/{row.donation_id}/dismiss",
                headers=auth(committee_member))
    db_session.refresh(row)
    assert row.income_type == "pass_through"  # not clobbered to mistake


# ---------------------------------------------------------------- bank import

CHASE_CSV = """Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
DEBIT,06/02/2026,COSTCO WHSE #0334,-412.88,DEBIT_CARD,,
DEBIT,05/28/2026,POS PURCHASE PARTY CITY 1099,-86.20,DEBIT_CARD,,
CREDIT,06/04/2026,Zelle payment from LI CHEN 12345,200.00,QUICKPAY_CREDIT,,
CREDIT,06/05/2026,DEPOSIT CHECK 1042,300.00,DEPOSIT,,
"""


def test_bank_import_splits_flows(client, db_session, committee_member):
    resp = client.post("/api/finance/bank-import", json={"csv_text": CHASE_CSV},
                       headers=auth(committee_member))
    stats = resp.json()
    assert stats == {"expenses_added": 2, "income_added": 1, "duplicates": 0,
                     "skipped_gmail_synced": 1, "errors": 0}

    expenses = db_session.query(Expense).order_by(Expense.expense_date).all()
    assert [e.vendor for e in expenses] == ["PARTY CITY 1099", "COSTCO WHSE #0334"]
    assert float(expenses[1].amount) == 412.88
    assert expenses[1].event_code is None  # unclassified

    income = db_session.query(Donor).one()
    assert income.status == "pending"
    assert income.income_type is None
    assert "BANK|2026-06-05" in income.notes
    assert income.source == "Check"


def test_bank_import_is_idempotent(client, committee_member):
    client.post("/api/finance/bank-import", json={"csv_text": CHASE_CSV},
                headers=auth(committee_member))
    stats = client.post("/api/finance/bank-import", json={"csv_text": CHASE_CSV},
                        headers=auth(committee_member)).json()
    assert stats["expenses_added"] == 0
    assert stats["income_added"] == 0
    assert stats["duplicates"] == 3


def test_bank_import_bad_header_400(client, committee_member):
    resp = client.post("/api/finance/bank-import",
                       json={"csv_text": "a,b,c\n1,2,3\n"},
                       headers=auth(committee_member))
    assert resp.status_code == 400


def test_classify_and_delete_expense(client, db_session, committee_member):
    expense = seed_expense(db_session, event_code=None, expense_category_code=None)
    resp = client.post("/api/finance/expenses/classify", json={
        "expense_ids": [expense.id], "event_code": 1003,
        "expense_category_code": 5002,
    }, headers=auth(committee_member))
    assert resp.json() == {"updated": 1}
    db_session.refresh(expense)
    assert (expense.event_code, expense.expense_category_code) == (1003, 5002)

    assert client.delete(f"/api/finance/expenses/{expense.id}",
                         headers=auth(committee_member)).status_code == 200
    assert client.delete("/api/finance/expenses/999",
                         headers=auth(committee_member)).status_code == 404


# ---------------------------------------------------------------- directory

def test_directory_upsert_normalizes_and_updates(client, db_session, committee_member):
    resp = client.put("/api/finance/directory",
                      json={"name": "  Yue  Ma ", "email": "yue@example.com"},
                      headers=auth(committee_member))
    assert resp.json()["name"] == "yue ma"

    resp = client.put("/api/finance/directory",
                      json={"name": "YUE MA", "email": "new@example.com",
                            "is_insider": True},
                      headers=auth(committee_member))
    assert resp.json()["email"] == "new@example.com"
    assert resp.json()["is_insider"] is True
    assert db_session.query(DonorDirectoryEntry).count() == 1

    entries = client.get("/api/finance/directory", headers=auth(committee_member)).json()
    assert len(entries) == 1
    assert client.delete(f"/api/finance/directory/{entries[0]['id']}",
                         headers=auth(committee_member)).status_code == 200
    assert client.delete("/api/finance/directory/999",
                         headers=auth(committee_member)).status_code == 404


# ---------------------------------------------------------------- batch acks

def _fake_email(monkeypatch, outcomes=True):
    import email_service
    sent = []

    def fake_send(to_email, subject, body_html, body_text=None, attachments=None):
        sent.append({"to": to_email, "subject": subject, "text": body_text,
                     "attachments": attachments})
        return outcomes

    monkeypatch.setattr(email_service.EmailService, "send_email",
                        staticmethod(fake_send))
    return sent


def test_ack_queue_lists_unthanked_with_directory_emails(client, db_session, committee_member):
    seed_income(db_session, "A", name="Yue Ma")
    seed_income(db_session, "B", name="No Email",
                donation_date=date(2026, 5, 1))
    seed_income(db_session, "C", name="Thanked",
                thank_you_sent_at=datetime(2026, 7, 1))
    seed_income(db_session, "R", name="Revenue", income_type="event_revenue")
    db_session.add(DonorDirectoryEntry(name="yue ma", email="yue@example.com"))
    db_session.commit()

    queue = client.get("/api/finance/ack-queue", headers=auth(committee_member)).json()
    assert [q["name"] for q in queue] == ["Yue Ma", "No Email"]
    assert queue[0]["email"] == "yue@example.com"
    assert queue[1]["email"] is None


def test_send_acks_batch_sends_and_skips(client, db_session, committee_member, monkeypatch):
    sent = _fake_email(monkeypatch)
    a = seed_income(db_session, "A", name="Yue Ma", amount=500)
    b = seed_income(db_session, "B", name="No Email")
    db_session.add(DonorDirectoryEntry(name="yue ma", email="yue@example.com"))
    db_session.commit()

    resp = client.post("/api/finance/send-acks", json={},
                       headers=auth(committee_member)).json()
    assert resp["sent"] == 1 and resp["skipped"] == 1
    assert sent[0]["to"] == "yue@example.com"
    assert sent[0]["attachments"] is not None  # receipt attached

    db_session.expire_all()
    db_session.refresh(a)
    db_session.refresh(b)
    assert a.thank_you_sent_at is not None
    assert "Thank-you email" in a.notes
    assert b.thank_you_sent_at is None


def test_send_acks_subset_by_ids(client, db_session, committee_member, monkeypatch):
    _fake_email(monkeypatch)
    a = seed_income(db_session, "A", name="Yue Ma")
    seed_income(db_session, "B2", name="Yue Ma",
                donation_date=date(2026, 5, 1))
    db_session.add(DonorDirectoryEntry(name="yue ma", email="yue@example.com"))
    db_session.commit()

    resp = client.post("/api/finance/send-acks",
                       json={"donation_ids": [a.donation_id]},
                       headers=auth(committee_member)).json()
    assert resp["sent"] == 1


def test_auto_ack_batch_respects_switch(client, db_session, committee_member, monkeypatch):
    from sqlalchemy.orm import sessionmaker
    import database as database_mod
    from routes.finance import run_auto_ack_batch
    monkeypatch.setattr(database_mod, "SessionLocal",
                        sessionmaker(bind=db_session.get_bind()))
    _fake_email(monkeypatch)
    seed_income(db_session, "A", name="Yue Ma")
    db_session.add(DonorDirectoryEntry(name="yue ma", email="yue@example.com"))
    db_session.commit()

    assert run_auto_ack_batch() is None  # switch off

    client.put("/api/finance/settings", json={"auto_ack_enabled": True},
               headers=auth(committee_member))
    results = run_auto_ack_batch()
    assert results is not None
    assert sum(1 for r in results if r["sent"]) == 1


# ---------------------------------------------------------------- reports

def test_report_by_event_matrix(client, db_session, committee_member):
    seed_categories(db_session)
    seed_income(db_session, "D1", amount=200, event_code=1003)
    seed_income(db_session, "R1", amount=100, income_type="event_revenue",
                status="dismissed", event_code=1003)
    seed_income(db_session, "P1", amount=50, income_type="pass_through",
                status="dismissed", event_code=1004)
    seed_income(db_session, "M1", amount=999, income_type=None,
                status="dismissed", event_code=1004)  # unclassified: excluded
    seed_expense(db_session, amount=120, event_code=1003)

    report = client.get("/api/finance/reports/by-event",
                        headers=auth(committee_member)).json()
    by_code = {r["event_code"]: r for r in report["events"]}
    anniversary = by_code[1003]
    assert anniversary["donation"] == 200.0
    assert anniversary["event_revenue"] == 100.0
    assert anniversary["income_total"] == 300.0
    assert anniversary["expense_total"] == 120.0
    assert anniversary["net"] == 180.0
    # Pass-through is not the club's money: excluded from net
    bear = by_code[1004]
    assert bear["pass_through"] == 50.0
    assert bear["net"] == 0.0
    assert report["totals"]["income_total"] == 350.0


def test_report_by_event_year_filter_and_export(client, db_session, committee_member):
    seed_categories(db_session)
    seed_income(db_session, "D1", amount=200, donation_date=date(2025, 6, 1))
    seed_income(db_session, "D2", amount=300, donation_date=date(2026, 6, 1))
    report = client.get("/api/finance/reports/by-event", params={"year": 2025},
                        headers=auth(committee_member)).json()
    assert report["totals"]["donation"] == 200.0

    export = client.get("/api/finance/reports/by-event/export",
                        headers=auth(committee_member))
    assert export.headers["content-type"].startswith("text/csv")
    assert "TOTAL" in export.text


def test_report_yoy(client, db_session, committee_member):
    seed_categories(db_session)
    seed_income(db_session, "D1", amount=200, donation_date=date(2025, 6, 1),
                event_code=1004)
    seed_income(db_session, "D2", amount=300, donation_date=date(2026, 6, 1),
                event_code=1004)
    seed_expense(db_session, amount=100, expense_date=date(2026, 6, 2),
                 event_code=1004)

    report = client.get("/api/finance/reports/yoy", headers=auth(committee_member)).json()
    assert report["years"] == ["2025", "2026"]
    bear = next(r for r in report["events"] if r["event_code"] == 1004)
    assert bear["years"]["2025"] == {"income": 200.0, "expense": 0.0, "net": 200.0}
    assert bear["years"]["2026"] == {"income": 300.0, "expense": 100.0, "net": 200.0}


def test_public_support_test(client, db_session, committee_member):
    # Window: org start 2025 → FY2025-2029 (calendar years)
    client.put("/api/finance/settings", json={"org_start": "2025-01-01", "fye_month": 12},
               headers=auth(committee_member))
    # Big donor exceeding 2% cap and the $5k substantial threshold
    seed_income(db_session, "BIG", name="Big Donor", amount=6000,
                donation_date=date(2026, 6, 1))
    seed_income(db_session, "S1", name="Small One", amount=100,
                donation_date=date(2026, 6, 2))
    seed_income(db_session, "R1", name="Ticket Buyer", amount=400,
                income_type="event_revenue", status="dismissed",
                donation_date=date(2026, 6, 3))
    # Insider excluded under (a)(2)
    seed_income(db_session, "INS", name="Insider Ann", amount=500,
                donation_date=date(2026, 6, 4))
    db_session.add(DonorDirectoryEntry(name="insider ann", email="a@example.com",
                                       is_insider=True))
    db_session.commit()

    report = client.get("/api/finance/reports/public-support",
                        headers=auth(committee_member)).json()
    assert report["window_fys"] == [2025, 2026, 2027, 2028, 2029]
    support = report["support"]
    assert support["contributions"] == 6600.0
    assert support["gross_receipts"] == 400.0
    assert support["total_support"] == 7000.0

    t1 = report["test1_509a1"]
    assert t1["cap_2pct"] == 132.0  # 2% of 6600
    # Big donor capped at 132, small 100, insider capped at 132
    assert t1["public_support"] == 364.0

    t2 = report["test2_509a2"]
    # Big donor is a substantial contributor; insider excluded; small + GR count
    assert t2["dqp_excluded"] == 6500.0
    assert t2["public_support"] == 500.0
    reasons = {r["name"]: r["reason"] for r in t2["dqp_rows"]}
    assert "Substantial contributor" in reasons["Big Donor"]
    assert "Insider" in reasons["Insider Ann"]


# ---------------------------------------------------------------- year-end

def test_year_end_preview_groups_by_donor(client, db_session, committee_member):
    seed_income(db_session, "A1", name="Yue Ma", amount=500,
                donation_date=date(2026, 6, 4))
    seed_income(db_session, "A2", name="Yue Ma", amount=30,
                donation_date=date(2026, 2, 1), source="Venmo (Yue Ma)")
    seed_income(db_session, "B1", name="Other", amount=10,
                donation_date=date(2025, 6, 1))  # different year
    db_session.add(DonorDirectoryEntry(name="yue ma", email="yue@example.com"))
    db_session.commit()

    preview = client.get("/api/finance/year-end/preview", params={"year": 2026},
                         headers=auth(committee_member)).json()
    assert preview["total"] == 530.0
    donor = preview["donors"][0]
    assert donor["name"] == "Yue Ma"
    assert donor["count"] == 2
    assert donor["email"] == "yue@example.com"
    assert donor["items"][0]["date"] == "2026-02-01"
    assert donor["sent_at"] is None


def test_year_end_send_marks_and_skips_resend(client, db_session, committee_member, monkeypatch):
    sent = _fake_email(monkeypatch)
    seed_income(db_session, "A1", name="Yue Ma", amount=500,
                donation_date=date(2026, 6, 4))
    seed_income(db_session, "B1", name="No Email", amount=10,
                donation_date=date(2026, 5, 1))
    db_session.add(DonorDirectoryEntry(name="yue ma", email="yue@example.com"))
    db_session.commit()

    first = client.post("/api/finance/year-end/send", json={"year": 2026},
                        headers=auth(committee_member)).json()
    assert first["sent"] == 1 and first["skipped"] == 1
    assert "ANNUAL DONATION SUMMARY — TAX YEAR 2026" in sent[0]["text"]
    assert "$500.00" in sent[0]["text"]

    second = client.post("/api/finance/year-end/send", json={"year": 2026},
                         headers=auth(committee_member)).json()
    assert second["sent"] == 0  # already-sent guard
    assert any("already sent" in r.get("reason", "") for r in second["results"])

    preview = client.get("/api/finance/year-end/preview", params={"year": 2026},
                         headers=auth(committee_member)).json()
    assert preview["donors"][0]["sent_at"] is not None


# ---------------------------------------------------------------- settings

def test_finance_settings_roundtrip(client, committee_member):
    defaults = client.get("/api/finance/settings", headers=auth(committee_member)).json()
    assert defaults == {"auto_ack_enabled": False, "org_start": "2025-01-01",
                        "fye_month": 12}

    updated = client.put("/api/finance/settings",
                         json={"auto_ack_enabled": True, "org_start": "2025-04-01",
                               "fye_month": 11},
                         headers=auth(committee_member)).json()
    assert updated == {"auto_ack_enabled": True, "org_start": "2025-04-01",
                       "fye_month": 11}
