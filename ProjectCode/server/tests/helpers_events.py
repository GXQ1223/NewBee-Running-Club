"""Shared helpers for event/engagement/recurrence/highlights test modules."""
from datetime import date

from database import Event, EventRecurrenceRule


def make_event(db_session, name='Test Run', event_date=None, status='Upcoming', **overrides):
    """Insert an Event row directly and return it."""
    defaults = dict(
        name=name,
        date=event_date or date(2025, 6, 1),
        status=status,
    )
    defaults.update(overrides)
    event = Event(**defaults)
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    return event


def make_rule(db_session, event, recurrence_type='weekly', **overrides):
    """Insert an EventRecurrenceRule row for an event and return it."""
    rule = EventRecurrenceRule(
        event_id=event.id,
        recurrence_type=recurrence_type,
        **overrides,
    )
    db_session.add(rule)
    db_session.commit()
    db_session.refresh(rule)
    return rule
