"""Meeting minutes endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db, MeetingMinutes, Member
from models import MeetingMinutesCreate, MeetingMinutesUpdate, MeetingMinutesResponse
from utils.auth import get_current_admin

router = APIRouter(prefix="/api/meeting-minutes", tags=["meeting-minutes"])


@router.get("", response_model=List[MeetingMinutesResponse])
def get_all_meeting_minutes(db: Session = Depends(get_db)):
    """Get all meeting minutes, sorted by meeting date (most recent first)"""
    minutes = db.query(MeetingMinutes).order_by(MeetingMinutes.meeting_date.desc()).all()
    return minutes


@router.get("/{minutes_id}", response_model=MeetingMinutesResponse)
def get_meeting_minutes(minutes_id: int, db: Session = Depends(get_db)):
    """Get a specific meeting minutes by ID"""
    minutes = db.query(MeetingMinutes).filter(MeetingMinutes.id == minutes_id).first()
    if not minutes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting minutes with ID {minutes_id} not found"
        )
    return minutes


@router.post("", response_model=MeetingMinutesResponse)
def create_meeting_minutes(
    minutes: MeetingMinutesCreate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Create new meeting minutes (admin only)"""
    minutes_data = minutes.model_dump()
    minutes_data['created_by'] = current_admin.display_name or current_admin.username
    minutes_data['created_by_id'] = current_admin.id

    db_minutes = MeetingMinutes(**minutes_data)
    db.add(db_minutes)
    db.commit()
    db.refresh(db_minutes)
    return db_minutes


@router.put("/{minutes_id}", response_model=MeetingMinutesResponse)
def update_meeting_minutes(
    minutes_id: int,
    minutes_update: MeetingMinutesUpdate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Update meeting minutes (admin only)"""
    minutes = db.query(MeetingMinutes).filter(MeetingMinutes.id == minutes_id).first()
    if not minutes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting minutes with ID {minutes_id} not found"
        )

    update_data = minutes_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(minutes, field, value)

    db.commit()
    db.refresh(minutes)
    return minutes


@router.delete("/{minutes_id}")
def delete_meeting_minutes(
    minutes_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Delete meeting minutes (admin only)"""
    minutes = db.query(MeetingMinutes).filter(MeetingMinutes.id == minutes_id).first()
    if not minutes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting minutes with ID {minutes_id} not found"
        )

    db.delete(minutes)
    db.commit()
    return {"message": f"Meeting minutes {minutes_id} deleted successfully"}
