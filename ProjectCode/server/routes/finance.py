"""Finance module (Books Grid): two-layer income classification, expense
ledger with Chase CSV import, donor directory, batch acknowledgments,
cash-basis reports, and year-end donor statements.

Ports the workflows of the club's Google Sheet ("DONATION & EXPENSE
WORKFLOW" script) onto the website, keeping its category codes:
events 1xxx · income types 2xxx · expense categories 5xxx.
"""
import csv
import io
import json
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from typing import List, Optional

from database import (
    get_db, Donor, Expense, FinanceCategory, DonorDirectoryEntry, Member,
    SiteSetting,
)
from models import (
    FinanceCategoryCreate, FinanceCategoryUpdate, FinanceCategoryOut,
    ClassifyIncomeRequest, ManualIncomeRequest, DonorLedgerEntry,
    ExpenseOut, ClassifyExpenseRequest, BankImportRequest,
    DirectoryUpsertRequest, DirectoryEntryOut, SendAcksRequest,
    YearEndSendRequest, FinanceSettingsUpdate,
)
from utils.auth import get_current_committee_or_admin

router = APIRouter(prefix="/api/finance", tags=["finance"])

KIND_RANGES = {"event": 1000, "income_type": 2000, "expense": 5000}


def _normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip()).lower()


def _get_setting(db: Session, key: str):
    row = db.query(SiteSetting).filter(SiteSetting.key == key).first()
    return row.value if row else None


def _put_setting(db: Session, key: str, value: str, label: str = "Finance"):
    row = db.query(SiteSetting).filter(SiteSetting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(SiteSetting(key=key, value=value, label_en=label,
                           label_cn="财务", category="finance", is_active=True))


# ---------------------------------------------------------------------------
# Categories (events 1xxx / income types 2xxx / expense categories 5xxx)
# ---------------------------------------------------------------------------

@router.get("/categories")
def list_categories(db: Session = Depends(get_db), current_admin: Member = Depends(get_current_committee_or_admin)):
    rows = db.query(FinanceCategory).filter(FinanceCategory.is_active == True).order_by(  # noqa: E712
        FinanceCategory.code).all()
    out = {"events": [], "income_types": [], "expenses": []}
    for row in rows:
        entry = FinanceCategoryOut.model_validate(row).model_dump()
        if row.kind == "event":
            out["events"].append(entry)
        elif row.kind == "income_type":
            out["income_types"].append(entry)
        else:
            out["expenses"].append(entry)
    return out


@router.post("/categories", response_model=FinanceCategoryOut)
def create_category(request: FinanceCategoryCreate, db: Session = Depends(get_db),
                    current_admin: Member = Depends(get_current_committee_or_admin)):
    code = request.code
    if code is None:
        top = db.query(FinanceCategory).filter(
            FinanceCategory.kind == request.kind
        ).order_by(FinanceCategory.code.desc()).first()
        code = (top.code + 1) if top else KIND_RANGES[request.kind] + 1
    if db.query(FinanceCategory).filter(FinanceCategory.kind == request.kind,
                                        FinanceCategory.code == code).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Code {code} already exists for {request.kind}")
    row = FinanceCategory(kind=request.kind, code=code, name=request.name)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/categories/{category_id}", response_model=FinanceCategoryOut)
def update_category(category_id: int, request: FinanceCategoryUpdate,
                    db: Session = Depends(get_db),
                    current_admin: Member = Depends(get_current_committee_or_admin)):
    row = db.query(FinanceCategory).filter(FinanceCategory.id == category_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Category {category_id} not found")
    for field, value in request.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Income (donations table with two-layer classification)
# ---------------------------------------------------------------------------

@router.get("/income", response_model=List[DonorLedgerEntry])
def list_income(db: Session = Depends(get_db), current_admin: Member = Depends(get_current_committee_or_admin)):
    """Every money-in row, unclassified first, newest first within groups."""
    rows = db.query(Donor).order_by(
        Donor.donation_date.desc(), Donor.created_at.desc()).all()
    rows.sort(key=lambda d: d.income_type is not None)
    return rows


@router.post("/income/classify")
def classify_income(request: ClassifyIncomeRequest, db: Session = Depends(get_db),
                    current_admin: Member = Depends(get_current_committee_or_admin)):
    """Bulk two-layer classification. Only 'donation' rows publish to the
    public sponsor wall (status stays in sync for the legacy endpoints)."""
    rows = db.query(Donor).filter(Donor.donation_id.in_(request.donation_ids)).all()
    if len(rows) != len(set(request.donation_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="One or more donations not found")
    for donor in rows:
        donor.income_type = request.income_type
        if request.event_code is not None:
            donor.event_code = request.event_code
        elif donor.event_code is None:
            donor.event_code = 1001  # General
        donor.status = "confirmed" if request.income_type == "donation" else "dismissed"
    db.commit()
    return {"updated": len(rows)}


@router.post("/income/manual", response_model=DonorLedgerEntry)
def add_manual_income(request: ManualIncomeRequest, db: Session = Depends(get_db),
                      current_admin: Member = Depends(get_current_committee_or_admin)):
    """Record income that never hit Gmail or the bank import (e.g. cash)."""
    donor = Donor(
        donor_id=f"MAN_{int(datetime.utcnow().timestamp() * 1000)}",
        name=request.name,
        donor_type="individual",
        amount=request.amount,
        donation_date=request.donation_date or date.today(),
        source=request.method or "Manual",
        message=request.memo,
        notes="Manual entry 手动记账",
        donation_event="General Support",
        receipt_confirmed=False,
        quantity=1,
        income_type=request.income_type,
        event_code=request.event_code or 1001,
        status="confirmed" if request.income_type == "donation" else "dismissed",
    )
    db.add(donor)
    db.commit()
    db.refresh(donor)
    return donor


# ---------------------------------------------------------------------------
# Expenses + Chase CSV bank import
# ---------------------------------------------------------------------------

@router.get("/expenses", response_model=List[ExpenseOut])
def list_expenses(db: Session = Depends(get_db), current_admin: Member = Depends(get_current_committee_or_admin)):
    rows = db.query(Expense).order_by(Expense.expense_date.desc(), Expense.id.desc()).all()
    rows.sort(key=lambda e: e.expense_category_code is not None)
    return rows


@router.post("/expenses/classify")
def classify_expenses(request: ClassifyExpenseRequest, db: Session = Depends(get_db),
                      current_admin: Member = Depends(get_current_committee_or_admin)):
    rows = db.query(Expense).filter(Expense.id.in_(request.expense_ids)).all()
    if len(rows) != len(set(request.expense_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="One or more expenses not found")
    for expense in rows:
        if request.event_code is not None:
            expense.event_code = request.event_code
        if request.expense_category_code is not None:
            expense.expense_category_code = request.expense_category_code
    db.commit()
    return {"updated": len(rows)}


@router.delete("/expenses/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db),
                   current_admin: Member = Depends(get_current_committee_or_admin)):
    row = db.query(Expense).filter(Expense.id == expense_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Expense {expense_id} not found")
    db.delete(row)
    db.commit()
    return {"message": f"Expense {expense_id} deleted"}


def _method_from_description(description: str) -> str:
    lowered = (description or "").lower()
    if "zelle" in lowered:
        return "Zelle"
    if "venmo" in lowered:
        return "Venmo"
    if "check" in lowered:
        return "Check"
    if "ach" in lowered or "orig co" in lowered:
        return "ACH"
    if "atm" in lowered:
        return "ATM"
    return "Debit Card"


def _parse_amount(raw) -> Optional[Decimal]:
    try:
        return Decimal(str(raw).replace(",", "").replace("$", "").strip())
    except (InvalidOperation, AttributeError):
        return None


@router.post("/bank-import")
def import_bank_csv(request: BankImportRequest, db: Session = Depends(get_db),
                    current_admin: Member = Depends(get_current_committee_or_admin)):
    """Import a Chase statement CSV (Details, Posting Date, Description,
    Amount, Type ...). Outflows land in Expenses; inflows become income
    rows to classify — except Zelle/Venmo credits, which already arrive
    via the Gmail sync. Rows dedupe by a BANK| key so re-imports are safe.
    """
    reader = csv.reader(io.StringIO(request.csv_text))
    all_rows = [row for row in reader if any(str(c).strip() for c in row)]

    header_idx, col = None, {}
    for i, row in enumerate(all_rows[:10]):
        lowered = [str(c).lower().strip() for c in row]
        if "details" in lowered and "description" in lowered:
            header_idx = i
            col = {
                "details": lowered.index("details"),
                "date": lowered.index("posting date") if "posting date" in lowered else None,
                "desc": lowered.index("description"),
                "amount": lowered.index("amount") if "amount" in lowered else None,
            }
            break
    if header_idx is None or col.get("date") is None or col.get("amount") is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Could not find the Chase header row (needs "Details", '
                   '"Posting Date", "Description" and "Amount" columns)'
        )

    stats = {"expenses_added": 0, "income_added": 0, "duplicates": 0,
             "skipped_gmail_synced": 0, "errors": 0}

    existing_expense_ids = {e.import_id for e in db.query(Expense.import_id).all()}

    for row in all_rows[header_idx + 1:]:
        try:
            description = str(row[col["desc"]]).strip()
            amount = _parse_amount(row[col["amount"]])
            raw_date = str(row[col["date"]]).strip()
            if amount is None or not raw_date:
                continue
            posted = None
            for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"):
                try:
                    posted = datetime.strptime(raw_date, fmt).date()
                    break
                except ValueError:
                    continue
            if posted is None:
                continue

            import_id = f"BANK|{posted.isoformat()}|{amount}|{description[:40]}"

            if amount < 0:  # money out -> expense
                if import_id in existing_expense_ids:
                    stats["duplicates"] += 1
                    continue
                vendor = re.sub(
                    r"^(POS PURCHASE|DEBIT CARD PURCHASE|RECURRING PAYMENT|"
                    r"ONLINE PAYMENT|CHECKCARD)\s*", "",
                    description, flags=re.IGNORECASE).strip()[:255] or description[:255]
                db.add(Expense(
                    expense_date=posted,
                    vendor=vendor,
                    amount=-amount,
                    method=_method_from_description(description),
                    bank_description=description,
                    import_id=import_id,
                ))
                existing_expense_ids.add(import_id)
                stats["expenses_added"] += 1
            else:  # money in
                lowered = description.lower()
                if "zelle" in lowered or "venmo" in lowered:
                    # These arrive with donor names via the Gmail sync
                    stats["skipped_gmail_synced"] += 1
                    continue
                if db.query(Donor).filter(Donor.notes.contains(import_id)).first():
                    stats["duplicates"] += 1
                    continue
                db.add(Donor(
                    donor_id=f"BNK_{int(datetime.utcnow().timestamp() * 1000)}_{stats['income_added']}",
                    name=description[:255],
                    donor_type="individual",
                    amount=amount,
                    donation_date=posted,
                    source=_method_from_description(description),
                    notes=f"Bank import {import_id}",
                    donation_event="General Support",
                    receipt_confirmed=True,
                    quantity=1,
                    status="pending",
                ))
                stats["income_added"] += 1
        except Exception:
            stats["errors"] += 1

    db.commit()
    return stats


# ---------------------------------------------------------------------------
# Donor directory (name -> email memory)
# ---------------------------------------------------------------------------

@router.get("/directory", response_model=List[DirectoryEntryOut])
def list_directory(db: Session = Depends(get_db), current_admin: Member = Depends(get_current_committee_or_admin)):
    return db.query(DonorDirectoryEntry).order_by(DonorDirectoryEntry.name).all()


@router.put("/directory", response_model=DirectoryEntryOut)
def upsert_directory(request: DirectoryUpsertRequest, db: Session = Depends(get_db),
                     current_admin: Member = Depends(get_current_committee_or_admin)):
    normalized = _normalize_name(request.name)
    row = db.query(DonorDirectoryEntry).filter(
        DonorDirectoryEntry.name == normalized).first()
    if row:
        row.email = request.email
        if request.is_insider is not None:
            row.is_insider = request.is_insider
    else:
        row = DonorDirectoryEntry(name=normalized, email=request.email,
                                  is_insider=bool(request.is_insider))
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/directory/{entry_id}")
def delete_directory_entry(entry_id: int, db: Session = Depends(get_db),
                           current_admin: Member = Depends(get_current_committee_or_admin)):
    row = db.query(DonorDirectoryEntry).filter(DonorDirectoryEntry.id == entry_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Directory entry {entry_id} not found")
    db.delete(row)
    db.commit()
    return {"message": f"Directory entry {entry_id} deleted"}


def _directory_lookup(db: Session):
    return {e.name: e.email for e in db.query(DonorDirectoryEntry).all()}


# ---------------------------------------------------------------------------
# Batch acknowledgments
# ---------------------------------------------------------------------------

@router.get("/ack-queue")
def ack_queue(db: Session = Depends(get_db), current_admin: Member = Depends(get_current_committee_or_admin)):
    """Confirmed donations without a thank-you yet, with directory emails."""
    directory = _directory_lookup(db)
    rows = db.query(Donor).filter(
        Donor.income_type == "donation",
        Donor.thank_you_sent_at.is_(None),
    ).order_by(Donor.donation_date.desc()).all()
    return [{
        "donation_id": d.donation_id,
        "name": d.name,
        "amount": str(d.amount),
        "donation_date": d.donation_date.isoformat() if d.donation_date else None,
        "event_code": d.event_code,
        "email": directory.get(_normalize_name(d.name)),
    } for d in rows]


def _send_ack_batch(db: Session, donation_ids: Optional[List[int]] = None):
    """Send tiered acknowledgments (receipt attached) to every queue row
    with a directory email. Returns per-row results; commits as it goes so
    a failure mid-batch never loses earlier sends."""
    from routes.donors import send_acknowledgment
    directory = _directory_lookup(db)
    query = db.query(Donor).filter(
        Donor.income_type == "donation",
        Donor.thank_you_sent_at.is_(None),
    )
    if donation_ids:
        query = query.filter(Donor.donation_id.in_(donation_ids))
    results = []
    for donor in query.all():
        email = directory.get(_normalize_name(donor.name))
        if not email:
            results.append({"donation_id": donor.donation_id, "name": donor.name,
                            "sent": False, "reason": "no email in directory 缺邮箱"})
            continue
        try:
            send_acknowledgment(db, donor, email, attach_receipt=True)
            db.commit()
            results.append({"donation_id": donor.donation_id, "name": donor.name,
                            "sent": True, "email": email})
        except HTTPException as exc:
            db.rollback()
            results.append({"donation_id": donor.donation_id, "name": donor.name,
                            "sent": False, "reason": exc.detail})
    return results


@router.post("/send-acks")
def send_acks(request: SendAcksRequest, db: Session = Depends(get_db),
              current_admin: Member = Depends(get_current_committee_or_admin)):
    results = _send_ack_batch(db, request.donation_ids)
    return {"results": results,
            "sent": sum(1 for r in results if r["sent"]),
            "skipped": sum(1 for r in results if not r["sent"])}


def run_auto_ack_batch():
    """Weekly scheduler hook: batch-send acknowledgments when the
    finance_auto_ack switch is on. Returns results (or None when off)."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        if _get_setting(db, "finance_auto_ack") != "true":
            return None
        return _send_ack_batch(db)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Reports (cash basis)
# ---------------------------------------------------------------------------

def _year_of(d) -> Optional[int]:
    return d.year if d else None


@router.get("/reports/by-event")
def report_by_event(year: Optional[int] = None, db: Session = Depends(get_db),
                    current_admin: Member = Depends(get_current_committee_or_admin)):
    """Income (by type) and expenses per event; cash basis."""
    events = {c.code: c.name for c in db.query(FinanceCategory).filter(
        FinanceCategory.kind == "event").all()}
    matrix = {}

    def bucket(code):
        if code not in matrix:
            matrix[code] = {"event_code": code,
                            "event_name": events.get(code, f"#{code}" if code else "(unassigned 未分配)"),
                            "donation": 0.0, "event_revenue": 0.0, "pass_through": 0.0,
                            "income_total": 0.0, "expense_total": 0.0, "net": 0.0}
        return matrix[code]

    incomes = db.query(Donor).filter(Donor.income_type.in_(
        ["donation", "event_revenue", "pass_through"]))
    for d in incomes.all():
        if year and _year_of(d.donation_date) != year:
            continue
        b = bucket(d.event_code)
        amount = float(d.amount or 0)
        b[d.income_type] += amount
        b["income_total"] += amount

    for e in db.query(Expense).all():
        if year and _year_of(e.expense_date) != year:
            continue
        b = bucket(e.event_code)
        b["expense_total"] += float(e.amount or 0)

    for b in matrix.values():
        # Pass-through money isn't the club's — exclude from net
        b["net"] = round(b["income_total"] - b["pass_through"] - b["expense_total"], 2)
        for key in ("donation", "event_revenue", "pass_through", "income_total", "expense_total"):
            b[key] = round(b[key], 2)

    rows = sorted(matrix.values(), key=lambda r: (r["event_code"] is None, r["event_code"] or 0))
    totals = {k: round(sum(r[k] for r in rows), 2)
              for k in ("donation", "event_revenue", "pass_through",
                        "income_total", "expense_total", "net")}
    return {"year": year, "events": rows, "totals": totals}


@router.get("/reports/yoy")
def report_yoy(db: Session = Depends(get_db), current_admin: Member = Depends(get_current_committee_or_admin)):
    """Per-event income/expense/net by calendar year — the year-to-year,
    event-to-event comparison."""
    events = {c.code: c.name for c in db.query(FinanceCategory).filter(
        FinanceCategory.kind == "event").all()}
    data = {}

    def cell(code, yr):
        key = (code, yr)
        if key not in data:
            data[key] = {"income": 0.0, "expense": 0.0}
        return data[key]

    for d in db.query(Donor).filter(Donor.income_type.in_(
            ["donation", "event_revenue"])).all():
        yr = _year_of(d.donation_date)
        if yr:
            cell(d.event_code, yr)["income"] += float(d.amount or 0)
    for e in db.query(Expense).all():
        yr = _year_of(e.expense_date)
        if yr:
            cell(e.event_code, yr)["expense"] += float(e.amount or 0)

    years = sorted({yr for (_, yr) in data})
    rows = []
    for code in sorted({c for (c, _) in data}, key=lambda c: (c is None, c or 0)):
        row = {"event_code": code,
               "event_name": events.get(code, f"#{code}" if code else "(unassigned 未分配)"),
               "years": {}}
        for yr in years:
            c = data.get((code, yr), {"income": 0.0, "expense": 0.0})
            row["years"][str(yr)] = {"income": round(c["income"], 2),
                                     "expense": round(c["expense"], 2),
                                     "net": round(c["income"] - c["expense"], 2)}
        rows.append(row)
    return {"years": [str(y) for y in years], "events": rows}


@router.get("/reports/public-support")
def report_public_support(db: Session = Depends(get_db),
                          current_admin: Member = Depends(get_current_committee_or_admin)):
    """509(a)(1) + 509(a)(2) public support tests over the first-5-fiscal-
    year window. Management model — final numbers belong to the 990
    preparer (same disclaimer as the club's Sheet)."""
    org_start_raw = _get_setting(db, "finance_org_start") or "2025-01-01"
    fye_month = int(_get_setting(db, "finance_fye_month") or 12)
    org_start = datetime.strptime(org_start_raw, "%Y-%m-%d").date()

    def fiscal_year(d: date) -> int:
        # FY labeled by the calendar year the fiscal year ENDS in
        return d.year if d.month <= fye_month else d.year + 1

    first_fy = fiscal_year(org_start)
    window = [first_fy + i for i in range(5)]

    insiders = {e.name for e in db.query(DonorDirectoryEntry).filter(
        DonorDirectoryEntry.is_insider == True).all()}  # noqa: E712

    donors = {}
    gross_receipts = 0.0
    for d in db.query(Donor).filter(Donor.income_type.in_(
            ["donation", "event_revenue"])).all():
        if not d.donation_date:
            continue
        fy = fiscal_year(d.donation_date)
        if fy not in window:
            continue
        amount = float(d.amount or 0)
        if d.income_type == "event_revenue":
            gross_receipts += amount
            continue
        key = _normalize_name(d.name)
        entry = donors.setdefault(key, {"label": d.name, "total": 0.0,
                                        "insider": key in insiders})
        entry["total"] += amount

    donor_list = list(donors.values())
    total_contrib = sum(d["total"] for d in donor_list)
    total_support = total_contrib + gross_receipts  # other income not tracked

    # Test 1 — 509(a)(1): gross receipts excluded; per-donor 2% cap
    ts1 = total_contrib
    cap = 0.02 * ts1
    ps1 = sum(min(d["total"], cap) for d in donor_list)
    excess1 = sum(max(d["total"] - cap, 0) for d in donor_list)
    ratio1 = (ps1 / ts1) if ts1 else 0

    # Test 2 — 509(a)(2): disqualified persons excluded; gross receipts count
    ps2, dqp_excluded, dqp_rows = 0.0, 0.0, []
    for d in donor_list:
        substantial = d["total"] > 5000 and d["total"] > 0.02 * total_contrib
        if d["insider"] or substantial:
            dqp_excluded += d["total"]
            dqp_rows.append({"name": d["label"], "amount": round(d["total"], 2),
                             "reason": "Insider (officer/founder/family)" if d["insider"]
                             else "Substantial contributor (>$5,000 & >2%)"})
        else:
            ps2 += d["total"]
    ps2 += gross_receipts
    ratio2 = (ps2 / total_support) if total_support else 0

    # Headroom — largest single new outside gift keeping ratios >= 1/3
    gmax2 = max(3 * ps2 - total_support, 0)
    gmax1 = max(ps1 / (1 / 3 - 0.02) - ts1, 0) if ts1 else 0

    watch = sorted(donor_list, key=lambda d: -d["total"])[:15]
    return {
        "disclaimer": "Management model — final numbers belong to the 990 preparer. "
                      "管理层模型，正式数字以报税会计师为准。",
        "org_start": org_start_raw, "fye_month": fye_month,
        "window_fys": window,
        "support": {"contributions": round(total_contrib, 2),
                    "gross_receipts": round(gross_receipts, 2),
                    "total_support": round(total_support, 2)},
        "test1_509a1": {"total_support": round(ts1, 2), "cap_2pct": round(cap, 2),
                        "public_support": round(ps1, 2),
                        "excluded_by_cap": round(excess1, 2),
                        "ratio": round(ratio1, 4), "passes": ratio1 >= 1 / 3},
        "test2_509a2": {"dqp_excluded": round(dqp_excluded, 2),
                        "public_support": round(ps2, 2),
                        "ratio": round(ratio2, 4), "passes": ratio2 > 1 / 3,
                        "dqp_rows": dqp_rows},
        "headroom": {"max_gift_a1": round(gmax1, 2), "max_gift_a2": round(gmax2, 2)},
        "watch_list": [{"name": d["label"], "total": round(d["total"], 2),
                        "insider": d["insider"]} for d in watch],
    }


@router.get("/reports/by-event/export")
def export_by_event(year: Optional[int] = None, db: Session = Depends(get_db),
                    current_admin: Member = Depends(get_current_committee_or_admin)):
    report = report_by_event(year=year, db=db, current_admin=current_admin)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Event", "Donation", "Event Revenue", "Pass-through",
                     "Income Total", "Expenses", "Net"])
    for row in report["events"]:
        writer.writerow([row["event_name"], row["donation"], row["event_revenue"],
                         row["pass_through"], row["income_total"],
                         row["expense_total"], row["net"]])
    t = report["totals"]
    writer.writerow(["TOTAL", t["donation"], t["event_revenue"], t["pass_through"],
                     t["income_total"], t["expense_total"], t["net"]])
    filename = f"newbee-finance-by-event{'-' + str(year) if year else ''}.csv"
    return Response(content=buffer.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ---------------------------------------------------------------------------
# Year-end donor statements
# ---------------------------------------------------------------------------

def _year_end_data(db: Session, year: int):
    directory = _directory_lookup(db)
    per_donor = {}
    for d in db.query(Donor).filter(Donor.income_type == "donation").all():
        if not d.donation_date or d.donation_date.year != year:
            continue
        key = _normalize_name(d.name)
        entry = per_donor.setdefault(key, {"name": d.name, "email": directory.get(key),
                                           "count": 0, "total": 0.0, "items": []})
        entry["count"] += 1
        entry["total"] += float(d.amount or 0)
        entry["items"].append({
            "date": d.donation_date.isoformat(),
            "amount": float(d.amount or 0),
            "method": re.sub(r"\s*\(.*\)\s*$", "", d.source or "").strip() or "—",
        })
    for entry in per_donor.values():
        entry["total"] = round(entry["total"], 2)
        entry["items"].sort(key=lambda i: i["date"])
    return sorted(per_donor.values(), key=lambda e: -e["total"])


@router.get("/year-end/preview")
def year_end_preview(year: int, db: Session = Depends(get_db),
                     current_admin: Member = Depends(get_current_committee_or_admin)):
    sent_raw = _get_setting(db, f"finance_year_end_sent_{year}")
    sent = json.loads(sent_raw) if sent_raw else {}
    donors = _year_end_data(db, year)
    for d in donors:
        d["sent_at"] = sent.get(_normalize_name(d["name"]))
    return {"year": year, "donors": donors,
            "total": round(sum(d["total"] for d in donors), 2)}


def _year_end_letter(name: str, year: int, items, total: float, count: int):
    from routes.donors import RECEIPT_ORG, _text_to_html
    org = RECEIPT_ORG
    detail = "\n".join(
        f"    {i['date']}  ${i['amount']:,.2f}  ({i['method']})" for i in items)
    subject = f"{org['name']} — Annual Donation Summary, Tax Year {year}"
    body_text = (
        f"Dear {name},\n\n"
        f"Thank you for supporting {org['name']} throughout {year}. Below is a "
        "summary of your contributions for the tax year, provided for your records.\n\n"
        f"ANNUAL DONATION SUMMARY — TAX YEAR {year}\n"
        f"  Organization: {org['name']} (EIN: {org['ein']})\n"
        f"  Number of donations: {count}\n\n"
        f"  Itemized contributions:\n{detail}\n\n"
        f"  TOTAL: ${total:,.2f}\n\n"
        f"{org['name']} is a tax-exempt organization described in Section 501(c)(3) "
        "of the Internal Revenue Code. Contributions are tax-deductible to the "
        "extent allowed by law.\n\n"
        "No goods or services were provided in exchange for these contributions.\n\n"
        "Please retain this statement for your tax records. Thank you for being "
        f"part of our running community — we look forward to seeing you on the "
        f"road in {year + 1}!\n\n"
        f"Sincerely,\n{org['name']}\n{org['contact_email']}"
    )
    return subject, _text_to_html(body_text), body_text


@router.post("/year-end/send")
def year_end_send(request: YearEndSendRequest, db: Session = Depends(get_db),
                  current_admin: Member = Depends(get_current_committee_or_admin)):
    from email_service import EmailService
    key = f"finance_year_end_sent_{request.year}"
    sent_raw = _get_setting(db, key)
    sent = json.loads(sent_raw) if sent_raw else {}

    wanted = {_normalize_name(n) for n in request.names} if request.names else None
    results = []
    for entry in _year_end_data(db, request.year):
        normalized = _normalize_name(entry["name"])
        if wanted is not None and normalized not in wanted:
            continue
        if normalized in sent:
            results.append({"name": entry["name"], "sent": False,
                            "reason": f"already sent {sent[normalized]}"})
            continue
        if not entry["email"]:
            results.append({"name": entry["name"], "sent": False,
                            "reason": "no email in directory 缺邮箱"})
            continue
        subject, body_html, body_text = _year_end_letter(
            entry["name"], request.year, entry["items"], entry["total"], entry["count"])
        if EmailService.send_email(entry["email"], subject, body_html, body_text):
            sent[normalized] = datetime.utcnow().isoformat()
            results.append({"name": entry["name"], "sent": True, "email": entry["email"]})
        else:
            results.append({"name": entry["name"], "sent": False,
                            "reason": "email send failed"})

    _put_setting(db, key, json.dumps(sent), label=f"Year-end sent {request.year}")
    db.commit()
    return {"results": results,
            "sent": sum(1 for r in results if r["sent"]),
            "skipped": sum(1 for r in results if not r["sent"])}


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

@router.get("/settings")
def get_finance_settings(db: Session = Depends(get_db),
                         current_admin: Member = Depends(get_current_committee_or_admin)):
    return {
        "auto_ack_enabled": _get_setting(db, "finance_auto_ack") == "true",
        "org_start": _get_setting(db, "finance_org_start") or "2025-01-01",
        "fye_month": int(_get_setting(db, "finance_fye_month") or 12),
    }


@router.put("/settings")
def update_finance_settings(request: FinanceSettingsUpdate, db: Session = Depends(get_db),
                            current_admin: Member = Depends(get_current_committee_or_admin)):
    if request.auto_ack_enabled is not None:
        _put_setting(db, "finance_auto_ack",
                     "true" if request.auto_ack_enabled else "false",
                     label="Auto-send acknowledgments weekly")
    if request.org_start is not None:
        datetime.strptime(request.org_start, "%Y-%m-%d")  # validate
        _put_setting(db, "finance_org_start", request.org_start)
    if request.fye_month is not None:
        _put_setting(db, "finance_fye_month", str(request.fye_month))
    db.commit()
    return get_finance_settings(db=db, current_admin=current_admin)
