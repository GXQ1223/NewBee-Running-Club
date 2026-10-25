"""Heylo activity sync endpoints.

The club runs its weekly activities on Heylo, which has no public API.
An external checker (the weekly Monday automation, or a committee
member's script) reads the club's Heylo group and pushes the activities
here; this module upserts them as website events with
event_type='heylo'.

Dedup key: the Heylo event page URL, stored in `signup_link`.
Re-syncing the same Heylo event updates the existing row instead of
duplicating it. Optional fields sent as null mean "not provided" and
leave the existing value untouched, so manual edits made on the
website survive a re-sync.
"""
from datetime import date as date_type
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db, Event, Member
from models import (
    HeyloSyncRequest,
    HeyloSyncResponse,
    HeyloSyncItemResult,
    HeyloSyncedEvent,
)
from routes.events import _normalize_status
from utils.auth import get_current_committee_or_admin

router = APIRouter(prefix="/api/heylo", tags=["heylo"])

# Fields copied from a sync item onto the event row when provided.
_SYNC_FIELDS = (
    'name', 'chinese_name', 'date', 'time', 'location', 'chinese_location',
    'description', 'chinese_description', 'image', 'heylo_embed',
)


def _status_pair(item) -> Tuple[str, Optional[bool]]:
    """Resolve (status, is_highlight) for a sync item.

    An explicit status wins (legacy 'Highlight' is normalized via the
    same helper the events CRUD uses). Otherwise the status is derived
    from the date: 'Past' once the date has passed, else 'Upcoming'.
    is_highlight is None when the sync has no opinion about it.
    """
    if item.status is not None:
        data = {'status': item.status, 'date': item.date}
        _normalize_status(data)
        return data['status'], data.get('is_highlight')
    return ('Past' if item.date < date_type.today() else 'Upcoming'), None


@router.get("/synced", response_model=List[HeyloSyncedEvent])
def get_synced_heylo_events(db: Session = Depends(get_db)):
    """All website events that came from Heylo, for pre-sync diffing."""
    return (
        db.query(Event)
        .filter(Event.event_type == 'heylo')
        .order_by(Event.date.desc())
        .all()
    )


@router.post("/sync", response_model=HeyloSyncResponse)
def sync_heylo_activities(
    payload: HeyloSyncRequest,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin),
):
    """Create or update website events from Heylo activities (committee/admin)."""
    created = updated = unchanged = 0
    results: List[HeyloSyncItemResult] = []

    for item in payload.activities:
        status_value, highlight_value = _status_pair(item)
        updates = {
            field: getattr(item, field)
            for field in _SYNC_FIELDS
            if getattr(item, field) is not None
        }

        existing = (
            db.query(Event)
            .filter(
                Event.event_type == 'heylo',
                Event.signup_link == item.signup_link,
            )
            .first()
        )

        if existing is None:
            event = Event(
                event_type='heylo',
                signup_link=item.signup_link,
                status=status_value,
                is_highlight=bool(highlight_value),
                **updates,
            )
            db.add(event)
            db.flush()
            created += 1
            results.append(HeyloSyncItemResult(
                signup_link=item.signup_link, event_id=event.id, action='created',
            ))
            continue

        changed = False
        for field, value in updates.items():
            if getattr(existing, field) != value:
                setattr(existing, field, value)
                changed = True
        if existing.status != status_value:
            existing.status = status_value
            changed = True
        if highlight_value is not None and existing.is_highlight != highlight_value:
            existing.is_highlight = highlight_value
            changed = True

        if changed:
            updated += 1
            action = 'updated'
        else:
            unchanged += 1
            action = 'unchanged'
        results.append(HeyloSyncItemResult(
            signup_link=item.signup_link, event_id=existing.id, action=action,
        ))

    db.commit()
    return HeyloSyncResponse(
        created=created, updated=updated, unchanged=unchanged, results=results,
    )
