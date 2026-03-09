"""Club credits endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, Header, Request, File, UploadFile, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import logging

from database import get_db, TempClubCredit, Member
from models import TempClubCreditCreate, TempClubCreditUpdate, TempClubCreditResponse, CreditType
from utils.auth import get_current_admin, get_current_committee_or_admin

logger = logging.getLogger(__name__)
router = APIRouter(tags=["credits"])


@router.get("/api/credits", response_model=List[TempClubCreditResponse])
def get_all_credits(
    credit_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get all temp club credits, optionally filtered by credit type.
    Credit types: 'total', 'activity', 'registration', 'volunteer'
    """
    query = db.query(TempClubCredit)
    if credit_type:
        if credit_type not in ['total', 'activity', 'registration', 'volunteer']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Credit type must be 'total', 'activity', 'registration', or 'volunteer'"
            )
        query = query.filter(TempClubCredit.credit_type == credit_type)

    # Sort by total credits descending (registration + checkin)
    credits = query.order_by(
        (TempClubCredit.registration_credits + TempClubCredit.checkin_credits).desc(),
        TempClubCredit.full_name
    ).all()
    return credits


@router.get("/api/credits/member/{member_name}")
def get_member_credits(member_name: str, db: Session = Depends(get_db)):
    """Get aggregated club credits for a specific member by name."""
    credits = db.query(TempClubCredit).filter(
        TempClubCredit.full_name.ilike(member_name)
    ).all()

    result = {
        "registration_credits": 0,
        "checkin_credits": 0,
        "volunteer_credits": 0,
        "activity_credits": 0
    }

    for credit in credits:
        reg = float(credit.registration_credits or 0)
        checkin = float(credit.checkin_credits or 0)
        if credit.credit_type == 'volunteer':
            result["volunteer_credits"] += reg + checkin
        elif credit.credit_type == 'activity':
            result["activity_credits"] += reg + checkin
        else:
            result["registration_credits"] += reg
            result["checkin_credits"] += checkin

    return result


@router.get("/api/credits/{credit_id}", response_model=TempClubCreditResponse)
def get_credit_by_id(credit_id: int, db: Session = Depends(get_db)):
    """Get a specific credit entry by ID"""
    credit = db.query(TempClubCredit).filter(TempClubCredit.id == credit_id).first()
    if not credit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Credit with ID {credit_id} not found"
        )
    return credit


@router.post("/api/credits", response_model=TempClubCreditResponse)
def create_credit(
    credit: TempClubCreditCreate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Create a new credit entry (admin only)"""
    credit_data = credit.model_dump()
    # Convert enum to string value
    if 'credit_type' in credit_data and credit_data['credit_type']:
        credit_data['credit_type'] = credit_data['credit_type'].value

    db_credit = TempClubCredit(**credit_data)
    db.add(db_credit)
    db.commit()
    db.refresh(db_credit)
    return db_credit


@router.put("/api/credits/{credit_id}", response_model=TempClubCreditResponse)
def update_credit(
    credit_id: int,
    credit_update: TempClubCreditUpdate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Update a credit entry (admin only)"""
    credit = db.query(TempClubCredit).filter(TempClubCredit.id == credit_id).first()
    if not credit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Credit with ID {credit_id} not found"
        )

    update_data = credit_update.model_dump(exclude_unset=True)

    # Convert enum to string if credit_type is being updated
    if 'credit_type' in update_data and update_data['credit_type']:
        update_data['credit_type'] = update_data['credit_type'].value

    for field, value in update_data.items():
        setattr(credit, field, value)

    db.commit()
    db.refresh(credit)
    return credit


@router.delete("/api/credits/{credit_id}")
def delete_credit(
    credit_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Delete a credit entry (admin only)"""
    credit = db.query(TempClubCredit).filter(TempClubCredit.id == credit_id).first()
    if not credit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Credit with ID {credit_id} not found"
        )

    db.delete(credit)
    db.commit()
    return {"message": f"Credit {credit_id} deleted successfully"}


@router.post("/api/credits/bulk-upload")
async def bulk_upload_credits(
    file: UploadFile = File(...),
    credit_type: str = Form(...),
    mode: str = Form("merge"),
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """
    Bulk upload credits from CSV file (admin or committee only).

    - credit_type: 'total', 'activity', 'registration', or 'volunteer'
    - mode: 'replace' (delete all existing of that type first) or 'merge' (update existing, add new)
    - CSV columns: fullName, registration_sum, checkin_sum

    Note: When uploading 'activity', 'registration', or 'volunteer', total credits are automatically
    recalculated. When uploading 'total' directly, auto-recalculation is skipped.
    """
    import csv
    import io
    from decimal import Decimal, InvalidOperation

    # Validate credit_type
    valid_types = ['total', 'activity', 'registration', 'volunteer']
    if credit_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid credit_type. Must be one of: {', '.join(valid_types)}"
        )

    # Validate mode
    if mode not in ['replace', 'merge']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mode must be 'replace' or 'merge'"
        )

    # Read and parse CSV file
    try:
        contents = await file.read()
        # Try to decode as UTF-8, fallback to latin-1
        try:
            decoded = contents.decode('utf-8')
        except UnicodeDecodeError:
            decoded = contents.decode('latin-1')

        reader = csv.DictReader(io.StringIO(decoded))
        rows = list(reader)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse CSV file: {str(e)}"
        )

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file is empty"
        )

    # Validate required columns
    required_columns = ['fullName', 'registration_sum', 'checkin_sum']
    # Check for columns (case-insensitive matching)
    header_mapping = {}
    if rows:
        first_row_keys = list(rows[0].keys())
        for req_col in required_columns:
            found = False
            for key in first_row_keys:
                if key.lower().strip() == req_col.lower():
                    header_mapping[req_col] = key
                    found = True
                    break
            if not found:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Missing required column: {req_col}. Required columns: {', '.join(required_columns)}"
                )

    # If replace mode, delete all existing entries of this type
    if mode == 'replace':
        db.query(TempClubCredit).filter(TempClubCredit.credit_type == credit_type).delete()
        db.commit()

    # Process rows
    rows_processed = 0
    rows_added = 0
    rows_updated = 0
    errors = []

    for i, row in enumerate(rows, start=2):  # Start at 2 to account for header row
        try:
            full_name = row.get(header_mapping['fullName'], '').strip()
            if not full_name:
                errors.append(f"Row {i}: Empty name")
                continue

            try:
                reg_credits = Decimal(str(row.get(header_mapping['registration_sum'], '0') or '0').strip())
            except (InvalidOperation, ValueError):
                errors.append(f"Row {i}: Invalid registration_sum value")
                continue

            try:
                checkin_credits = Decimal(str(row.get(header_mapping['checkin_sum'], '0') or '0').strip())
            except (InvalidOperation, ValueError):
                errors.append(f"Row {i}: Invalid checkin_sum value")
                continue

            # Check if entry exists (for merge mode)
            existing = db.query(TempClubCredit).filter(
                TempClubCredit.full_name == full_name,
                TempClubCredit.credit_type == credit_type
            ).first()

            if existing:
                # Update existing
                existing.registration_credits = reg_credits
                existing.checkin_credits = checkin_credits
                rows_updated += 1
            else:
                # Create new
                new_credit = TempClubCredit(
                    full_name=full_name,
                    credit_type=credit_type,
                    registration_credits=reg_credits,
                    checkin_credits=checkin_credits
                )
                db.add(new_credit)
                rows_added += 1

            rows_processed += 1

        except Exception as e:
            errors.append(f"Row {i}: {str(e)}")

    db.commit()

    # Recalculate total credits for all users (skip if uploading 'total' directly)
    if credit_type == 'total':
        # Skip auto-recalculation when total is uploaded directly
        return {
            "message": "Bulk upload completed",
            "credit_type": credit_type,
            "mode": mode,
            "rows_processed": rows_processed,
            "rows_added": rows_added,
            "rows_updated": rows_updated,
            "totals_recalculated": 0,
            "errors": errors[:10] if errors else [],
            "total_errors": len(errors)
        }

    # Get all unique names from activity, registration, and volunteer types
    all_credits = db.query(TempClubCredit).filter(
        TempClubCredit.credit_type.in_(['activity', 'registration', 'volunteer'])
    ).all()

    # Aggregate by name
    totals_by_name = {}
    for credit in all_credits:
        if credit.full_name not in totals_by_name:
            totals_by_name[credit.full_name] = {
                'registration_credits': Decimal('0'),
                'checkin_credits': Decimal('0')
            }
        totals_by_name[credit.full_name]['registration_credits'] += credit.registration_credits or Decimal('0')
        totals_by_name[credit.full_name]['checkin_credits'] += credit.checkin_credits or Decimal('0')

    # Update or create total entries
    totals_updated = 0
    totals_added = 0

    # First, delete all existing total entries that are no longer needed
    existing_total_names = set(
        c.full_name for c in db.query(TempClubCredit).filter(
            TempClubCredit.credit_type == 'total'
        ).all()
    )

    # Delete totals for names no longer in the component types
    names_to_delete = existing_total_names - set(totals_by_name.keys())
    if names_to_delete:
        db.query(TempClubCredit).filter(
            TempClubCredit.credit_type == 'total',
            TempClubCredit.full_name.in_(names_to_delete)
        ).delete(synchronize_session=False)

    for name, totals in totals_by_name.items():
        existing_total = db.query(TempClubCredit).filter(
            TempClubCredit.full_name == name,
            TempClubCredit.credit_type == 'total'
        ).first()

        if existing_total:
            existing_total.registration_credits = totals['registration_credits']
            existing_total.checkin_credits = totals['checkin_credits']
            totals_updated += 1
        else:
            new_total = TempClubCredit(
                full_name=name,
                credit_type='total',
                registration_credits=totals['registration_credits'],
                checkin_credits=totals['checkin_credits']
            )
            db.add(new_total)
            totals_added += 1

    db.commit()

    return {
        "message": "Bulk upload completed",
        "credit_type": credit_type,
        "mode": mode,
        "rows_processed": rows_processed,
        "rows_added": rows_added,
        "rows_updated": rows_updated,
        "totals_recalculated": totals_updated + totals_added,
        "errors": errors[:10] if errors else [],  # Limit errors to first 10
        "total_errors": len(errors)
    }
