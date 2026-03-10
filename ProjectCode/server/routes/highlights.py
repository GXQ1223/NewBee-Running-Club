"""Event group/merge and highlights endpoints for iOS-style folder grouping."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from database import get_db, Event, Member
from models import (
    EventGroupMergeRequest, EventGroupMergeResponse,
    EventGroupUpdateNameRequest, EventInGroup, EventGroup,
    HighlightsGroupedResponse
)
from utils.auth import get_current_committee_or_admin
from utils.name_detector import detect_group_name_from_events

router = APIRouter(tags=["Event Groups & Highlights"])


@router.post("/api/events/groups/merge", response_model=EventGroupMergeResponse)
def merge_events_to_group(
    request: EventGroupMergeRequest,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """
    Merge two events into a group (iOS-style folder).
    If either event is already in a group, the other joins that group.
    If both are standalone, a new group is created.
    """
    event_a = db.query(Event).filter(Event.id == request.event_a_id).first()
    event_b = db.query(Event).filter(Event.id == request.event_b_id).first()

    if not event_a or not event_b:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or both events not found")

    if request.event_a_id == request.event_b_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot merge an event with itself")

    # Determine the parent event (group leader)
    parent_event = None
    child_event = None

    if event_b.is_recurring and not event_b.parent_event_id:
        # B is already a group parent, add A to it
        parent_event = event_b
        child_event = event_a
    elif event_a.is_recurring and not event_a.parent_event_id:
        # A is already a group parent, add B to it
        parent_event = event_a
        child_event = event_b
    elif event_b.parent_event_id:
        # B is in a group, add A to B's parent
        parent_event = db.query(Event).filter(Event.id == event_b.parent_event_id).first()
        child_event = event_a
    elif event_a.parent_event_id:
        # A is in a group, add B to A's parent
        parent_event = db.query(Event).filter(Event.id == event_a.parent_event_id).first()
        child_event = event_b
    else:
        # Both are standalone - make B the parent (drop target becomes parent)
        parent_event = event_b
        child_event = event_a
        parent_event.is_recurring = True

    # Add child to group
    child_event.parent_event_id = parent_event.id
    child_event.is_recurring = False

    # Auto-detect group name
    group_events = db.query(Event).filter(
        (Event.id == parent_event.id) | (Event.parent_event_id == parent_event.id)
    ).all()

    events_data = [{'name': e.name, 'chinese_name': e.chinese_name} for e in group_events]
    en_name, cn_name = detect_group_name_from_events(events_data)

    parent_event.group_name = en_name
    parent_event.group_name_cn = cn_name

    db.commit()

    # Count events in group
    event_count = db.query(Event).filter(
        (Event.id == parent_event.id) | (Event.parent_event_id == parent_event.id)
    ).count()

    return EventGroupMergeResponse(
        parent_event_id=parent_event.id,
        group_name=parent_event.group_name or parent_event.name,
        group_name_cn=parent_event.group_name_cn,
        event_count=event_count,
        message=f"Events merged into '{parent_event.group_name or parent_event.name}'"
    )


@router.post("/api/events/{event_id}/remove-from-group")
def remove_event_from_group(
    event_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """Remove an event from its group. If only one event remains, dissolve the group."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Case 1: Event is a child (has parent_event_id)
    if event.parent_event_id:
        parent_id = event.parent_event_id
        event.parent_event_id = None
        event.group_name = None
        event.group_name_cn = None

        # Check remaining children
        remaining_children = db.query(Event).filter(Event.parent_event_id == parent_id).count()

        if remaining_children == 0:
            # No more children, dissolve the group
            parent = db.query(Event).filter(Event.id == parent_id).first()
            if parent:
                parent.is_recurring = False
                parent.group_name = None
                parent.group_name_cn = None

        db.commit()
        return {
            "message": "Event removed from group",
            "group_dissolved": remaining_children == 0
        }

    # Case 2: Event is a parent (is_recurring=True, no parent_event_id)
    elif event.is_recurring:
        # Get all children
        children = db.query(Event).filter(Event.parent_event_id == event_id).all()

        if len(children) == 0:
            # No children, just unmark as recurring
            event.is_recurring = False
            event.group_name = None
            event.group_name_cn = None
            db.commit()
            return {
                "message": "Group dissolved",
                "group_dissolved": True
            }
        elif len(children) == 1:
            # Only one child - dissolve the group entirely
            child = children[0]
            child.parent_event_id = None
            event.is_recurring = False
            event.group_name = None
            event.group_name_cn = None
            db.commit()
            return {
                "message": "Group dissolved (only 2 events)",
                "group_dissolved": True
            }
        else:
            # Multiple children - promote the most recent child to be the new parent
            # Sort children by date descending
            from datetime import date as date_type
            children.sort(key=lambda e: e.date or date_type.min, reverse=True)
            new_parent = children[0]

            # Transfer parent status to the new parent
            new_parent.is_recurring = True
            new_parent.parent_event_id = None
            new_parent.group_name = event.group_name
            new_parent.group_name_cn = event.group_name_cn

            # Update remaining children to point to new parent
            for child in children[1:]:
                child.parent_event_id = new_parent.id

            # Remove group status from old parent
            event.is_recurring = False
            event.parent_event_id = None
            event.group_name = None
            event.group_name_cn = None

            db.commit()
            return {
                "message": f"Event removed. New group parent: {new_parent.name}",
                "group_dissolved": False,
                "new_parent_id": new_parent.id
            }
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event is not in a group")


@router.get("/api/events/highlights/grouped", response_model=HighlightsGroupedResponse)
def get_highlights_grouped(db: Session = Depends(get_db)):
    """Get highlight events organized by groups for the Highlights page."""
    from datetime import date as date_type

    # Get all highlight events that are in the past
    today = date_type.today()
    all_highlights = db.query(Event).filter(
        Event.status == 'Highlight',
        Event.date < today
    ).order_by(Event.date.desc()).all()

    # Separate into groups and standalone events
    groups_map = {}  # parent_id -> list of events
    standalone_events = []
    seen_in_groups = set()

    for event in all_highlights:
        if event.is_recurring and not event.parent_event_id:
            # This is a group parent
            if event.id not in groups_map:
                groups_map[event.id] = []
            groups_map[event.id].insert(0, event)  # Parent first
            seen_in_groups.add(event.id)
        elif event.parent_event_id:
            # This is a group child
            if event.parent_event_id not in groups_map:
                groups_map[event.parent_event_id] = []
            groups_map[event.parent_event_id].append(event)
            seen_in_groups.add(event.id)

    # Collect standalone events
    for event in all_highlights:
        if event.id not in seen_in_groups:
            standalone_events.append(event)

    # Build group responses
    groups = []
    for parent_id, events in groups_map.items():
        if not events:
            continue

        # Sort by date descending
        events.sort(key=lambda e: e.date or date_type.min, reverse=True)

        # Get parent event for group info
        parent = events[0] if events[0].id == parent_id else db.query(Event).filter(Event.id == parent_id).first()

        if not parent:
            continue

        # Build event list
        event_list = [
            EventInGroup(
                id=e.id,
                name=e.name,
                chinese_name=e.chinese_name,
                date=e.date,
                time=e.time,
                location=e.location,
                chinese_location=e.chinese_location,
                image=e.image,
                status=e.status
            )
            for e in events
        ]

        # Most recent event for cover
        most_recent = events[0]

        groups.append(EventGroup(
            parent_event_id=parent_id,
            group_name=parent.group_name or parent.name,
            group_name_cn=parent.group_name_cn or parent.chinese_name,
            event_count=len(events),
            events=event_list,
            cover_image=most_recent.image,
            cover_image_position=most_recent.image_position,
            cover_event_id=most_recent.id,
            most_recent_date=most_recent.date
        ))

    # Sort groups by most recent date
    groups.sort(key=lambda g: g.most_recent_date, reverse=True)

    # Filter groups with only 1 event - treat them as standalone
    final_groups = []
    for group in groups:
        if group.event_count <= 1:
            # Add the single event to standalone
            if group.events:
                single_event = db.query(Event).filter(Event.id == group.events[0].id).first()
                if single_event:
                    standalone_events.append(single_event)
        else:
            final_groups.append(group)

    # Re-sort standalone events by date descending after adding converted events
    standalone_events.sort(key=lambda e: e.date or date_type.min, reverse=True)

    return HighlightsGroupedResponse(
        groups=final_groups,
        standalone_events=standalone_events
    )


@router.put("/api/events/groups/{parent_id}/name")
def update_group_name(
    parent_id: int,
    request: EventGroupUpdateNameRequest,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """Update the display name of an event group."""
    parent = db.query(Event).filter(Event.id == parent_id).first()

    if not parent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if not parent.is_recurring:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event is not a group parent")

    parent.group_name = request.group_name
    parent.group_name_cn = request.group_name_cn

    db.commit()

    return {
        "message": "Group name updated",
        "group_name": parent.group_name,
        "group_name_cn": parent.group_name_cn
    }


@router.post("/api/events/groups/{parent_id}/undo-merge")
def undo_group_merge(
    parent_id: int,
    event_id: int = Query(..., description="The event that was just added"),  # Query param
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """Undo a recent merge operation by removing the last added event."""
    event = db.query(Event).filter(Event.id == event_id).first()

    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if event.parent_event_id != parent_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event is not in this group")

    event.parent_event_id = None
    db.flush()  # Ensure unlinked event is excluded from remaining count

    # Check if group should be dissolved
    remaining = db.query(Event).filter(Event.parent_event_id == parent_id).count()

    if remaining == 0:
        parent = db.query(Event).filter(Event.id == parent_id).first()
        if parent:
            parent.is_recurring = False
            parent.group_name = None
            parent.group_name_cn = None

    db.commit()

    return {
        "message": "Merge undone",
        "group_dissolved": remaining == 0
    }
