"""Donor management endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from database import get_db, Donor, Member, SiteSetting
from models import (
    DonorCreate, DonorUpdate, DonorResponse, DonorsListResponse, DonationSummary,
    DonorPublicResponse, DonorLinkMemberRequest
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
        Donor.notes != "Anonymous Donor"  # Exclude anonymous donors as per original logic
    ).order_by(Donor.donation_date.desc(), Donor.name).all()

    enterprise_donors = db.query(Donor).filter(
        Donor.donor_type == "enterprise"
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
    ).group_by(Donor.donor_type).all()

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
    # Get all non-anonymous donors
    donors = db.query(Donor).filter(
        Donor.notes != "Anonymous Donor"
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


@router.get("/{donor_type}", response_model=List[DonorResponse])
def get_donors_by_type(donor_type: str, db: Session = Depends(get_db)):
    """Get donors by type (individual or enterprise), sorted by donation_date (most recent first)"""
    if donor_type not in ["individual", "enterprise"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Donor type must be 'individual' or 'enterprise'"
        )

    donors = db.query(Donor).filter(Donor.donor_type == donor_type).order_by(
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

    db_donor = Donor(**donor.dict())
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

    update_data = donor_update.dict(exclude_unset=True)
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
