"""Event CRUD endpoints."""
from datetime import date as date_type
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db, Event, Member, EventCommentSettings, Comment, Like, Reaction, EventGalleryImage, EventRecurrenceRule
from models import EventCreate, EventUpdate, EventResponse
from utils.auth import get_current_committee_or_admin

router = APIRouter(prefix="/api/events", tags=["events"])


def _query_by_status_param(db: Session, event_status: str):
    """Filter helper that supports the legacy 'Highlight' alias.

    'Highlight' historically meant "past + featured." Map it to
    status='Past' AND is_highlight=True so old callers keep working.
    """
    query = db.query(Event)
    if event_status == 'Highlight':
        query = query.filter(Event.status == 'Past', Event.is_highlight == True)
    else:
        query = query.filter(Event.status == event_status)
    return query


@router.get("", response_model=List[EventResponse])
def get_all_events(
    event_status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get all events, optionally filtered by status.
    Status can be: 'Upcoming', 'Past', 'Cancelled' (or legacy 'Highlight').
    """
    query = db.query(Event)
    if event_status:
        query = _query_by_status_param(db, event_status)
    events = query.order_by(Event.date.desc()).all()
    return events


@router.get("/status/{event_status}", response_model=List[EventResponse])
def get_events_by_status(event_status: str, db: Session = Depends(get_db)):
    """Get events filtered by status (Upcoming, Past, Cancelled, or legacy Highlight)."""
    events = _query_by_status_param(db, event_status).order_by(Event.date.desc()).all()
    return events


@router.get("/{event_id}", response_model=EventResponse)
def get_event(event_id: int, db: Session = Depends(get_db)):
    """Get a specific event by ID"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event with ID {event_id} not found"
        )
    return event


def _normalize_status(event_data: dict, current_event: Optional[Event] = None) -> None:
    """Coerce legacy status='Highlight' into the new (status, is_highlight) pair.

    Older clients (or cached bundles) still send 'Highlight' to mean "move to
    memories and feature it." Split into lifecycle + flag, and pick lifecycle
    based on date so a future highlight doesn't get buried in 'Past'.
    """
    if 'status' in event_data and event_data['status']:
        status_val = event_data['status']
        if hasattr(status_val, 'value'):
            status_val = status_val.value
        if status_val == 'Highlight':
            event_date = event_data.get('date')
            if event_date is None and current_event is not None:
                event_date = current_event.date
            if event_date is not None and event_date < date_type.today():
                event_data['status'] = 'Past'
            else:
                event_data['status'] = 'Upcoming'
            event_data['is_highlight'] = True
        else:
            event_data['status'] = status_val


@router.post("", response_model=EventResponse)
def create_event(
    event: EventCreate,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Create a new event (committee or admin)"""
    event_data = event.model_dump()
    _normalize_status(event_data)
    if 'event_type' in event_data and event_data['event_type']:
        event_data['event_type'] = event_data['event_type'].value

    db_event = Event(**event_data)
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event


@router.put("/{event_id}", response_model=EventResponse)
def update_event(
    event_id: int,
    event_update: EventUpdate,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Update an event (committee or admin)"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event with ID {event_id} not found"
        )

    update_data = event_update.model_dump(exclude_unset=True)

    _normalize_status(update_data, current_event=event)
    if 'event_type' in update_data and update_data['event_type']:
        update_data['event_type'] = update_data['event_type'].value

    for field, value in update_data.items():
        setattr(event, field, value)

    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}")
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Delete an event (committee or admin)"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event with ID {event_id} not found"
        )

    # Manually delete related records (MySQL FK cascades may not be set up correctly)
    db.query(EventCommentSettings).filter(EventCommentSettings.event_id == event_id).delete()
    db.query(Comment).filter(Comment.event_id == event_id).delete()
    db.query(Like).filter(Like.event_id == event_id).delete()
    db.query(Reaction).filter(Reaction.event_id == event_id).delete()
    db.query(EventGalleryImage).filter(EventGalleryImage.event_id == event_id).delete()
    db.query(EventRecurrenceRule).filter(EventRecurrenceRule.event_id == event_id).delete()
    # Unlink child events from this parent
    db.query(Event).filter(Event.parent_event_id == event_id).update({Event.parent_event_id: None})

    db.delete(event)
    db.commit()
    return {"message": f"Event {event_id} deleted successfully"}
