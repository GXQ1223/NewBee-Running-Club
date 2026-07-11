"""Donor management endpoints."""
import csv
import io
import json
import os
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import List, Optional

from database import get_db, Donor, Member, SiteSetting
from models import (
    DonorCreate, DonorUpdate, DonorResponse, DonorsListResponse, DonationSummary,
    DonorPublicResponse, DonorLinkMemberRequest, DonorLedgerEntry,
    DonationLedgerStats, DonationSyncStatus, DonationLedgerResponse,
    ApproveDonationRequest, SendThankYouRequest
)
from utils.auth import get_current_admin, get_current_committee_or_admin

router = APIRouter(prefix="/api/donors", tags=["donors"])


# Main endpoint for SponsorsPage - replaces CSV fetching
@router.get("", response_model=DonorsListResponse)
def get_all_donors(db: Session = Depends(get_db)):
    """
    Get all donors separated by type for SponsorsPage
    Replaces: /data/individualDonors.csv and /data/enterpriseDonors.csv
    Sorted by donation_date (most recent first)
    """
    individual_donors = db.query(Donor).filter(
        Donor.donor_type == "individual",
        Donor.status == "confirmed",
        # Exclude anonymous donors as per original logic (NULL notes must still match)
        or_(Donor.notes.is_(None), Donor.notes != "Anonymous Donor")
    ).order_by(Donor.donation_date.desc(), Donor.name).all()

    enterprise_donors = db.query(Donor).filter(
        Donor.donor_type == "enterprise",
        Donor.status == "confirmed"
    ).order_by(Donor.donation_date.desc(), Donor.name).all()

    return DonorsListResponse(
        individual_donors=individual_donors,
        enterprise_donors=enterprise_donors
    )

@router.get("/stats/summary", response_model=List[DonationSummary])
def get_donation_summary(db: Session = Depends(get_db)):
    """Get donation statistics by donor type for stakeholder reporting"""
    summary = db.query(
        Donor.donor_type,
        func.count(Donor.donation_id).label('donor_count'),
        func.sum(Donor.amount).label('total_amount'),
        func.avg(Donor.amount).label('average_amount'),
        func.min(Donor.amount).label('min_amount'),
        func.max(Donor.amount).label('max_amount')
    ).filter(Donor.status == "confirmed").group_by(Donor.donor_type).all()

    return [
        DonationSummary(
            donor_type=row.donor_type,
            donor_count=row.donor_count,
            total_amount=row.total_amount,
            average_amount=row.average_amount,
            min_amount=row.min_amount,
            max_amount=row.max_amount
        ) for row in summary
    ]


@router.get("/public", response_model=List[DonorPublicResponse])
def get_public_donors(db: Session = Depends(get_db)):
    """
    Get donors for public display with privacy rules applied:
    - Individual donors: hide amount, show date only
    - Enterprise donors: show amount
    - Respects linked member's show_in_donors setting
    - Excludes anonymous donors
    """
    # Get all non-anonymous confirmed donors (NULL notes must still match)
    donors = db.query(Donor).filter(
        Donor.status == "confirmed",
        or_(Donor.notes.is_(None), Donor.notes != "Anonymous Donor")
    ).order_by(Donor.donation_date.desc(), Donor.name).all()

    # Check global hide_amounts setting
    hide_amounts_setting = db.query(SiteSetting).filter(SiteSetting.key == "donors_hide_amounts").first()
    global_hide_amounts = hide_amounts_setting and hide_amounts_setting.value == "true"

    public_donors = []
    for donor in donors:
        # Check if linked to a member who has opted out of donor display
        if donor.member_id:
            linked_member = db.query(Member).filter(Member.id == donor.member_id).first()
            if linked_member and not linked_member.show_in_donors:
                continue  # Skip this donor

        # Apply privacy rules: hide amount if global setting is on, or for individual donors
        if global_hide_amounts:
            show_amount = False
        else:
            show_amount = donor.donor_type == 'enterprise' and not donor.hide_amount
        display_name = "Anonymous Donor" if donor.hide_name else donor.name

        public_donors.append(DonorPublicResponse(
            donation_id=donor.donation_id,
            donor_id=donor.donor_id,
            name=display_name,
            donor_type=donor.donor_type,
            donation_event=donor.donation_event,
            amount=donor.amount if show_amount else None,
            quantity=donor.quantity,
            donation_date=donor.donation_date,
            message=donor.message if not donor.hide_name else None
        ))

    return public_donors


@router.get("/hide-amounts")
def get_hide_amounts(db: Session = Depends(get_db)):
    """Get whether donation amounts are hidden globally."""
    setting = db.query(SiteSetting).filter(SiteSetting.key == "donors_hide_amounts").first()
    return {"hide_amounts": setting.value == "true" if setting else False}


@router.put("/hide-amounts")
def toggle_hide_amounts(db: Session = Depends(get_db), current_admin: Member = Depends(get_current_committee_or_admin)):
    """Toggle the global hide donation amounts setting (admin only)."""
    setting = db.query(SiteSetting).filter(SiteSetting.key == "donors_hide_amounts").first()
    if not setting:
        setting = SiteSetting(
            key="donors_hide_amounts",
            value="true",
            label_en="Hide Donation Amounts",
            label_cn="隐藏捐款金额",
            category="donors",
            is_active=True
        )
        db.add(setting)
    else:
        setting.value = "false" if setting.value == "true" else "true"
    db.commit()
    db.refresh(setting)
    return {"hide_amounts": setting.value == "true"}


# ---------------------------------------------------------------------------
# Admin donation ledger (bookkeeping view, Gmail sync review, tax export).
# NOTE: these literal paths must be registered before the /{donor_type} route.
# ---------------------------------------------------------------------------

@router.get("/ledger", response_model=DonationLedgerResponse)
def get_donation_ledger(db: Session = Depends(get_db), current_admin: Member = Depends(get_current_committee_or_admin)):
    """
    Full donation ledger for committee/admin: every donation in every status
    (pending Gmail imports first), stat tiles, and Gmail sync health.
    """
    donations = db.query(Donor).order_by(
        Donor.donation_date.desc(), Donor.created_at.desc()
    ).all()
    # Pending reviews float to the top; sort is stable so date order is kept
    donations.sort(key=lambda d: d.status != "pending")

    confirmed = [d for d in donations if d.status == "confirmed"]
    current_year = date.today().year
    ytd = [d for d in confirmed if d.donation_date and d.donation_date.year == current_year]

    stats = DonationLedgerStats(
        ytd_total=sum(d.amount for d in ytd) or 0,
        ytd_count=len(ytd),
        alltime_total=sum(d.amount for d in confirmed) or 0,
        alltime_count=len(confirmed),
        donor_count=len({d.name for d in confirmed}),
        pending_count=sum(1 for d in donations if d.status == "pending"),
        unthanked_count=sum(1 for d in confirmed if not d.thank_you_sent_at),
    )

    last_run_setting = db.query(SiteSetting).filter(SiteSetting.key == "donation_sync_last_run").first()
    last_result_setting = db.query(SiteSetting).filter(SiteSetting.key == "donation_sync_last_result").first()
    last_result = None
    if last_result_setting and last_result_setting.value:
        try:
            last_result = json.loads(last_result_setting.value)
        except (json.JSONDecodeError, TypeError):
            last_result = None

    next_run = None
    try:
        from scheduler import scheduler as bg_scheduler
        job = bg_scheduler.get_job("sync_zelle_donations") if bg_scheduler.running else None
        if job and job.next_run_time:
            next_run = job.next_run_time.isoformat()
    except Exception:
        next_run = None

    sync = DonationSyncStatus(
        last_run=last_run_setting.value if last_run_setting else None,
        last_result=last_result,
        next_run=next_run,
    )

    return DonationLedgerResponse(donations=donations, stats=stats, sync=sync)


@router.post("/donations/{donation_id}/approve", response_model=DonorLedgerEntry)
def approve_donation(
    donation_id: int,
    request: ApproveDonationRequest,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """Approve a pending Gmail-imported donation so it shows publicly.

    Optional corrections (donor_type, name, hide_name) are applied first.
    """
    donor = db.query(Donor).filter(Donor.donation_id == donation_id).first()
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donation {donation_id} not found"
        )

    if request.donor_type is not None:
        donor.donor_type = request.donor_type.value
    if request.name:
        donor.name = request.name
    if request.hide_name is not None:
        donor.hide_name = request.hide_name
    donor.status = "confirmed"

    db.commit()
    db.refresh(donor)
    return donor


@router.post("/donations/{donation_id}/revert", response_model=DonorLedgerEntry)
def revert_donation(
    donation_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """Send a donation back to pending review (undo an accidental approve
    or dismiss). It disappears from the public page until re-approved."""
    donor = db.query(Donor).filter(Donor.donation_id == donation_id).first()
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donation {donation_id} not found"
        )

    donor.status = "pending"
    db.commit()
    db.refresh(donor)
    return donor


@router.post("/donations/{donation_id}/dismiss", response_model=DonorLedgerEntry)
def dismiss_donation(
    donation_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """Dismiss a pending donation (kept in the ledger, never shown publicly)."""
    donor = db.query(Donor).filter(Donor.donation_id == donation_id).first()
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donation {donation_id} not found"
        )

    donor.status = "dismissed"
    db.commit()
    db.refresh(donor)
    return donor


def _thank_you_email(donor):
    """Default bilingual thank-you letter (replace when the club supplies
    its own template). Returns (subject, body_html, body_text)."""
    amount = f"${donor.amount:,.2f}"
    on_date = (
        f" on {donor.donation_date.strftime('%B %d, %Y')}" if donor.donation_date else ""
    )
    cn_date = (
        f"于 {donor.donation_date.strftime('%Y年%m月%d日')} " if donor.donation_date else ""
    )
    subject = "Thank you for supporting NewBee Running Club! 感谢您支持新蜂跑团！"
    body_text = (
        f"Dear {donor.name},\n\n"
        f"Thank you for your generous donation of {amount}{on_date}. "
        "Your support enables us to organize running programs and better serve our members, "
        "fostering a stronger, healthier, and more connected community.\n\n"
        f"亲爱的 {donor.name}：\n\n"
        f"感谢您{cn_date}向新蜂跑团捐赠 {amount}。您的支持帮助我们组织跑步活动、"
        "更好地服务会员，共同建设一个更强大、更健康、更紧密的社区。\n\n"
        "With gratitude,\nNewBee Running Club 新蜂跑团\nnewbeerunningclub.org"
    )
    body_html = (
        '<div style="font-family:Roboto,sans-serif;max-width:560px;margin:0 auto;color:#212121">'
        '<h2 style="color:#F29400">Thank you! 谢谢您！</h2>'
        f"<p>Dear {donor.name},</p>"
        f"<p>Thank you for your generous donation of <b style=\"color:#F29400\">{amount}</b>{on_date}. "
        "Your support enables us to organize running programs and better serve our members, "
        "fostering a stronger, healthier, and more connected community.</p>"
        f"<p>亲爱的 {donor.name}：</p>"
        f"<p>感谢您{cn_date}向新蜂跑团捐赠 <b style=\"color:#F29400\">{amount}</b>。"
        "您的支持帮助我们组织跑步活动、更好地服务会员，共同建设一个更强大、更健康、更紧密的社区。</p>"
        '<p style="margin-top:24px">With gratitude, 满怀感激<br>'
        '<b>NewBee Running Club 新蜂跑团</b><br>'
        '<a href="https://newbeerunningclub.org" style="color:#F29400">newbeerunningclub.org</a></p>'
        "</div>"
    )
    return subject, body_html, body_text


@router.post("/donations/{donation_id}/send-thank-you", response_model=DonorLedgerEntry)
def send_thank_you(
    donation_id: int,
    request: SendThankYouRequest,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """Email the donor a thank-you letter and stamp thank_you_sent_at.

    Payment notification emails don't include the donor's address, so the
    committee supplies the recipient email.
    """
    donor = db.query(Donor).filter(Donor.donation_id == donation_id).first()
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donation {donation_id} not found"
        )
    if donor.status != "confirmed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only confirmed donations can receive a thank-you email"
        )

    from email_service import EmailService
    subject, body_html, body_text = _thank_you_email(donor)
    if not EmailService.send_email(request.email, subject, body_html, body_text):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send the email — check the server email configuration"
        )

    sent_at = datetime.utcnow()
    donor.thank_you_sent_at = sent_at
    # Audit trail: record the full acknowledgment in the notes so the ledger
    # shows exactly what was sent, to whom, and when
    ack_record = (
        f"—— Thank-you email 感谢邮件 ——\n"
        f"Sent to {request.email} on {sent_at.strftime('%b %d, %Y %H:%M')} UTC\n"
        f"Subject: {subject}\n\n"
        f"{body_text}"
    )
    donor.notes = f"{donor.notes}\n\n{ack_record}" if donor.notes else ack_record
    db.commit()
    db.refresh(donor)
    return donor


@router.post("/sync-gmail")
def sync_gmail_now(current_admin: Member = Depends(get_current_committee_or_admin)):
    """
    Manually trigger the Gmail Zelle donation sync (same pipeline as the
    weekly scheduler job). Returns the sync statistics.
    """
    if not os.getenv("GMAIL_USER") or not os.getenv("GMAIL_APP_PASSWORD"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gmail credentials are not configured on the server"
        )

    from sync_zelle_donations import sync_zelle_donations
    stats = sync_zelle_donations(status="pending")
    return stats


@router.get("/tax-report")
def generate_tax_report(
    start_date: date,
    end_date: date,
    format: str = "csv",
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """
    Export confirmed donations in a date range for tax filing.
    format=csv → per-donation detail; format=pdf → per-donor summary.
    """
    if format not in ("csv", "pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Format must be 'csv' or 'pdf'"
        )
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be on or after start_date"
        )

    donations = db.query(Donor).filter(
        Donor.status == "confirmed",
        Donor.donation_date >= start_date,
        Donor.donation_date <= end_date
    ).order_by(Donor.donation_date, Donor.name).all()

    filename = f"newbee-donations-{start_date.isoformat()}-to-{end_date.isoformat()}"

    if format == "csv":
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            "Date", "Donor", "Type", "Event", "Amount (USD)",
            "Source", "Receipt Confirmed", "Notes"
        ])
        for d in donations:
            writer.writerow([
                d.donation_date.isoformat() if d.donation_date else "",
                d.name,
                d.donor_type,
                d.donation_event or "",
                f"{d.amount:.2f}",
                d.source or "",
                "yes" if d.receipt_confirmed else "no",
                d.notes or "",
            ])
        total = sum(d.amount for d in donations) or 0
        writer.writerow([])
        writer.writerow(["Total", "", "", "", f"{total:.2f}", "", "", ""])
        return Response(
            content=buffer.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'}
        )

    # PDF summary: totals grouped by donor
    pdf_bytes = _build_tax_pdf(donations, start_date, end_date)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'}
    )


def _build_tax_pdf(donations, start_date: date, end_date: date) -> bytes:
    """Render the per-donor summary PDF with reportlab."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    # Group by donor name, keeping first-seen order
    by_donor = {}
    for d in donations:
        entry = by_donor.setdefault(d.name, {"type": d.donor_type, "count": 0, "total": 0})
        entry["count"] += 1
        entry["total"] += d.amount
    grand_total = sum(e["total"] for e in by_donor.values()) or 0

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.8 * inch)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("NewBee Running Club — Donation Summary", styles["Title"]),
        Paragraph(
            f"Period: {start_date.strftime('%b %d, %Y')} – {end_date.strftime('%b %d, %Y')}",
            styles["Normal"]
        ),
        Paragraph(
            f"Generated: {datetime.utcnow().strftime('%b %d, %Y')} · "
            f"{len(donations)} donation(s) · {len(by_donor)} donor(s)",
            styles["Normal"]
        ),
        Spacer(1, 0.3 * inch),
    ]

    rows = [["Donor", "Type", "Donations", "Total (USD)"]]
    for name, entry in by_donor.items():
        rows.append([name, entry["type"], str(entry["count"]), f"${entry['total']:,.2f}"])
    rows.append(["Grand Total", "", str(len(donations)), f"${grand_total:,.2f}"])

    table = Table(rows, colWidths=[3.2 * inch, 1.2 * inch, 1.1 * inch, 1.5 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#FFA500")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.black),
        ("GRID", (0, 0), (-1, -2), 0.5, colors.HexColor("#EEE7DC")),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)
    doc.build(story)
    return buffer.getvalue()


@router.get("/{donor_type}", response_model=List[DonorResponse])
def get_donors_by_type(donor_type: str, db: Session = Depends(get_db)):
    """Get donors by type (individual or enterprise), sorted by donation_date (most recent first)"""
    if donor_type not in ["individual", "enterprise"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Donor type must be 'individual' or 'enterprise'"
        )

    donors = db.query(Donor).filter(
        Donor.donor_type == donor_type,
        Donor.status == "confirmed"
    ).order_by(
        Donor.donation_date.desc(), Donor.name
    ).all()
    return donors

@router.post("", response_model=DonorResponse)
def create_donor(donor: DonorCreate, db: Session = Depends(get_db), current_admin: Member = Depends(get_current_committee_or_admin)):
    """Create a new donor"""
    # Check if donor_id already exists
    existing = db.query(Donor).filter(Donor.donor_id == donor.donor_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Donor with ID {donor.donor_id} already exists"
        )

    db_donor = Donor(**donor.model_dump())
    db.add(db_donor)
    db.commit()
    db.refresh(db_donor)
    return db_donor

@router.get("/id/{donor_id}", response_model=DonorResponse)
def get_donor_by_id(donor_id: str, db: Session = Depends(get_db)):
    """Get a specific donor by donor_id"""
    donor = db.query(Donor).filter(Donor.donor_id == donor_id).first()
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donor with ID {donor_id} not found"
        )
    return donor

@router.put("/{donor_id}", response_model=DonorResponse)
def update_donor(donor_id: str, donor_update: DonorUpdate, db: Session = Depends(get_db), current_admin: Member = Depends(get_current_committee_or_admin)):
    """Update a donor"""
    donor = db.query(Donor).filter(Donor.donor_id == donor_id).first()
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donor with ID {donor_id} not found"
        )

    update_data = donor_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(donor, field, value)

    db.commit()
    db.refresh(donor)
    return donor

@router.delete("/{donor_id}")
def delete_donor(donor_id: str, db: Session = Depends(get_db), current_admin: Member = Depends(get_current_committee_or_admin)):
    """Delete a donor"""
    donor = db.query(Donor).filter(Donor.donor_id == donor_id).first()
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donor with ID {donor_id} not found"
        )

    db.delete(donor)
    db.commit()
    return {"message": f"Donor {donor_id} deleted successfully"}


@router.put("/{donor_id}/link-member")
def link_donor_to_member(
    donor_id: str,
    request: DonorLinkMemberRequest,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Link a donor record to a member account (admin only)"""
    donor = db.query(Donor).filter(Donor.donor_id == donor_id).first()
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donor with ID {donor_id} not found"
        )

    member = db.query(Member).filter(Member.id == request.member_id).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {request.member_id} not found"
        )

    donor.member_id = request.member_id
    db.commit()
    db.refresh(donor)

    return {
        "message": f"Donor {donor.name} linked to member {member.display_name or member.username}",
        "donor_id": donor_id,
        "member_id": request.member_id
    }
