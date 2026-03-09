"""Member activity tracking endpoints."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db, Member, MemberActivity
from models import MemberActivityCreate, MemberActivityResponse, ActivityVerifyRequest
from utils.auth import get_current_committee_or_admin

router = APIRouter(tags=["activities"])


@router.get("/api/members/{member_id}/activities", response_model=List[MemberActivityResponse])
def get_member_activities(
    member_id: int,
    db: Session = Depends(get_db)
):
    """Get a member's offline activity records"""
    activities = db.query(MemberActivity).filter(
        MemberActivity.member_id == member_id
    ).order_by(MemberActivity.activity_number).all()
    return activities


@router.post("/api/members/{member_id}/activities", response_model=MemberActivityResponse)
def submit_member_activity(
    member_id: int,
    activity: MemberActivityCreate,
    db: Session = Depends(get_db)
):
    """Submit an offline activity record (part of join process)"""
    # Verify member exists
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {member_id} not found"
        )

    # Check if activity_number is already submitted
    existing = db.query(MemberActivity).filter(
        MemberActivity.member_id == member_id,
        MemberActivity.activity_number == activity.activity_number
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Activity {activity.activity_number} already submitted for this member"
        )

    # Create the activity record
    activity_data = activity.model_dump()
    activity_data['member_id'] = member_id
    activity_data['status'] = 'pending'

    db_activity = MemberActivity(**activity_data)
    db.add(db_activity)

    # Update member's activities_completed count
    member.activities_completed = db.query(MemberActivity).filter(
        MemberActivity.member_id == member_id
    ).count() + 1

    db.commit()
    db.refresh(db_activity)
    return db_activity


@router.put("/api/activities/{activity_id}/verify")
def verify_activity(
    activity_id: int,
    request: ActivityVerifyRequest,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Verify or reject a member activity (committee or admin)"""
    activity = db.query(MemberActivity).filter(MemberActivity.id == activity_id).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Activity with ID {activity_id} not found"
        )

    if activity.status != 'pending':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Activity is already {activity.status}"
        )

    if request.approved:
        activity.status = 'verified'
    else:
        activity.status = 'rejected'
        activity.rejection_reason = request.rejection_reason

    activity.verified_by = current_user.id
    activity.verified_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(activity)

    return {
        "message": f"Activity {'verified' if request.approved else 'rejected'}",
        "activity_id": activity_id,
        "status": activity.status
    }


@router.get("/api/activities/pending", response_model=List[MemberActivityResponse])
def get_pending_activities(
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Get all pending activities awaiting verification (committee or admin)"""
    activities = db.query(MemberActivity).filter(
        MemberActivity.status == 'pending'
    ).order_by(MemberActivity.created_at.desc()).all()
    return activities


@router.delete("/api/activities/{activity_id}")
def delete_activity(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Delete an activity record (committee or admin)"""
    activity = db.query(MemberActivity).filter(MemberActivity.id == activity_id).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Activity with ID {activity_id} not found"
        )

    member_id = activity.member_id
    db.delete(activity)

    # Update member's activities_completed count
    member = db.query(Member).filter(Member.id == member_id).first()
    if member:
        member.activities_completed = db.query(MemberActivity).filter(
            MemberActivity.member_id == member_id
        ).count()

    db.commit()
    return {"message": f"Activity {activity_id} deleted successfully"}
