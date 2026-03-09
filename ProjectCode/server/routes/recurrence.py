"""Event recurrence and series management endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db, Event, Member, EventRecurrenceRule
from models import (
    EventRecurrenceRuleCreate, EventRecurrenceRuleUpdate,
    EventRecurrenceRuleResponse, EventWithRecurrence, EventResponse
)
from utils.auth import get_current_admin

router = APIRouter(tags=["Event Recurrence"])


@router.get("/api/events/{event_id}/recurrence", response_model=EventRecurrenceRuleResponse)
def get_event_recurrence(
    event_id: int,
    db: Session = Depends(get_db)
):
    """Get recurrence rule for an event"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    rule = db.query(EventRecurrenceRule).filter(
        EventRecurrenceRule.event_id == event_id
    ).first()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No recurrence rule found for this event")

    return rule


@router.post("/api/events/{event_id}/recurrence", response_model=EventRecurrenceRuleResponse)
def create_event_recurrence(
    event_id: int,
    rule_data: EventRecurrenceRuleCreate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Create a recurrence rule for an event (admin only)"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Check if rule already exists
    existing_rule = db.query(EventRecurrenceRule).filter(
        EventRecurrenceRule.event_id == event_id
    ).first()
    if existing_rule:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recurrence rule already exists for this event. Use PUT to update."
        )

    # Create rule
    rule = EventRecurrenceRule(
        event_id=event_id,
        recurrence_type=rule_data.recurrence_type.value,
        days_of_week=rule_data.days_of_week,
        day_of_month=rule_data.day_of_month,
        week_of_month=rule_data.week_of_month,
        month_of_year=rule_data.month_of_year,
        custom_rule=rule_data.custom_rule,
        end_date=rule_data.end_date,
        max_occurrences=rule_data.max_occurrences
    )

    # Update event to be recurring
    event.is_recurring = True

    db.add(rule)
    db.commit()
    db.refresh(rule)

    return rule


@router.put("/api/events/{event_id}/recurrence", response_model=EventRecurrenceRuleResponse)
def update_event_recurrence(
    event_id: int,
    rule_update: EventRecurrenceRuleUpdate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Update recurrence rule for an event (admin only)"""
    rule = db.query(EventRecurrenceRule).filter(
        EventRecurrenceRule.event_id == event_id
    ).first()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No recurrence rule found for this event")

    update_data = rule_update.model_dump(exclude_unset=True)

    # Convert enum to string if present
    if 'recurrence_type' in update_data and update_data['recurrence_type']:
        update_data['recurrence_type'] = update_data['recurrence_type'].value

    for field, value in update_data.items():
        setattr(rule, field, value)

    db.commit()
    db.refresh(rule)

    return rule


@router.delete("/api/events/{event_id}/recurrence")
def delete_event_recurrence(
    event_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Delete recurrence rule for an event (stops future occurrences, admin only)"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    rule = db.query(EventRecurrenceRule).filter(
        EventRecurrenceRule.event_id == event_id
    ).first()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No recurrence rule found for this event")

    # Update event
    event.is_recurring = False

    db.delete(rule)
    db.commit()

    return {"message": "Recurrence rule deleted. No new occurrences will be generated."}


@router.post("/api/events/{event_id}/recurrence/generate")
def manually_generate_recurrence(
    event_id: int,
    count: int = 1,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Manually generate recurring event instances (admin only)"""
    from datetime import date, timedelta
    import json

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    rule = db.query(EventRecurrenceRule).filter(
        EventRecurrenceRule.event_id == event_id,
        EventRecurrenceRule.is_active == True
    ).first()
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active recurrence rule found for this event"
        )

    # Check if max occurrences reached
    if rule.max_occurrences and rule.occurrences_created >= rule.max_occurrences:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum occurrences ({rule.max_occurrences}) already reached"
        )

    generated_events = []
    base_date = rule.last_generated_date or event.date
    current_date = base_date

    for i in range(count):
        # Calculate next occurrence based on recurrence type
        if rule.recurrence_type == 'weekly':
            current_date = current_date + timedelta(weeks=1)
        elif rule.recurrence_type == 'biweekly':
            current_date = current_date + timedelta(weeks=2)
        elif rule.recurrence_type == 'monthly':
            # Simple monthly: add one month
            if rule.day_of_month:
                month = current_date.month + 1
                year = current_date.year
                if month > 12:
                    month = 1
                    year += 1
                day = min(rule.day_of_month, 28)  # Safe for all months
                current_date = date(year, month, day)
            else:
                current_date = current_date + timedelta(days=30)
        elif rule.recurrence_type == 'yearly':
            current_date = date(current_date.year + 1, current_date.month, current_date.day)
        else:
            # Custom: try to parse custom_rule JSON
            if rule.custom_rule:
                try:
                    custom = json.loads(rule.custom_rule)
                    interval_days = custom.get('interval_days', 7)
                    current_date = current_date + timedelta(days=interval_days)
                except Exception as e:
                    print(f"Error parsing custom rule: {e}")
                    current_date = current_date + timedelta(weeks=1)
            else:
                current_date = current_date + timedelta(weeks=1)

        # Check if past end date
        if rule.end_date and current_date > rule.end_date:
            break

        # Check if max occurrences reached
        if rule.max_occurrences and rule.occurrences_created + len(generated_events) + 1 > rule.max_occurrences:
            break

        # Create new event instance
        new_event = Event(
            name=event.name,
            chinese_name=event.chinese_name,
            date=current_date,
            time=event.time,
            location=event.location,
            chinese_location=event.chinese_location,
            description=event.description,
            chinese_description=event.chinese_description,
            image=event.image,
            signup_link=event.signup_link,
            status='Upcoming',
            event_type=event.event_type,
            heylo_embed=event.heylo_embed,
            is_recurring=False,  # Instance is not itself recurring
            parent_event_id=event_id
        )

        db.add(new_event)
        generated_events.append({
            "date": str(current_date),
            "name": event.name
        })

    # Update rule tracking
    if generated_events:
        rule.last_generated_date = current_date
        rule.occurrences_created += len(generated_events)

    db.commit()

    return {
        "message": f"Generated {len(generated_events)} recurring event instances",
        "events": generated_events
    }


@router.get("/api/events/{event_id}/with-recurrence", response_model=EventWithRecurrence)
def get_event_with_recurrence(
    event_id: int,
    db: Session = Depends(get_db)
):
    """Get event with its recurrence rule (if any)"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Get recurrence rule if exists
    rule = db.query(EventRecurrenceRule).filter(
        EventRecurrenceRule.event_id == event_id
    ).first()

    return EventWithRecurrence(
        id=event.id,
        name=event.name,
        chinese_name=event.chinese_name,
        date=event.date,
        time=event.time,
        location=event.location,
        chinese_location=event.chinese_location,
        description=event.description,
        chinese_description=event.chinese_description,
        image=event.image,
        signup_link=event.signup_link,
        status=event.status,
        event_type=event.event_type or 'standard',
        heylo_embed=event.heylo_embed,
        is_recurring=event.is_recurring or False,
        parent_event_id=event.parent_event_id,
        next_occurrence_date=event.next_occurrence_date,
        recurrence=rule,
        created_at=event.created_at,
        updated_at=event.updated_at
    )


@router.get("/api/events/{event_id}/series", response_model=List[EventResponse])
def get_event_series(
    event_id: int,
    db: Session = Depends(get_db)
):
    """Get all events in a recurring series."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Determine parent ID
    if event.is_recurring and event.parent_event_id is None:
        # This is the parent event
        parent_id = event.id
    elif event.parent_event_id:
        # This is a child event
        parent_id = event.parent_event_id
    else:
        # Not recurring, return just this event
        return [event]

    # Get parent and all children
    parent = db.query(Event).filter(Event.id == parent_id).first()
    children = db.query(Event).filter(Event.parent_event_id == parent_id).all()

    # Combine parent (if it has a date) and children
    from datetime import date as date_type
    series = ([parent] if parent and parent.date else []) + children
    series.sort(key=lambda e: e.date or date_type.min, reverse=True)
    return series


@router.post("/api/events/{event_id}/add-to-series/{parent_id}")
def add_event_to_series(
    event_id: int,
    parent_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Add an existing event to a recurring series (admin only)."""
    # Get the event to be added
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Get the parent event
    parent = db.query(Event).filter(Event.id == parent_id).first()
    if not parent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent event not found")

    # Verify parent is a recurring event
    if not parent.is_recurring:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target event is not a recurring series"
        )

    # Prevent adding the parent to itself
    if event_id == parent_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot add an event to itself"
        )

    # Update the event
    event.parent_event_id = parent_id
    event.is_recurring = False  # Child events are not recurring themselves
    db.commit()

    return {"message": f"Event {event_id} added to series {parent_id}"}


@router.post("/api/events/{event_id}/toggle-series-parent")
def toggle_series_parent(
    event_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Toggle an event as a series parent (admin only)."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if event.parent_event_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot mark a child event as a series parent"
        )

    event.is_recurring = not event.is_recurring
    db.commit()

    return {"message": f"Event {'marked' if event.is_recurring else 'unmarked'} as series parent",
            "is_recurring": event.is_recurring}


@router.post("/api/events/{event_id}/dissolve-series")
def dissolve_series(
    event_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Dissolve a series - unlink all children (admin only)."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event or not event.is_recurring:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a series parent")

    children = db.query(Event).filter(Event.parent_event_id == event_id).all()
    for child in children:
        child.parent_event_id = None
    event.is_recurring = False
    db.commit()

    return {"message": f"Series dissolved. {len(children)} events unlinked."}


@router.post("/api/events/{event_id}/remove-from-series")
def remove_event_from_series(
    event_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Remove an event from its series (admin only)."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event or not event.parent_event_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event not in a series")

    event.parent_event_id = None
    db.commit()
    return {"message": "Event removed from series"}
