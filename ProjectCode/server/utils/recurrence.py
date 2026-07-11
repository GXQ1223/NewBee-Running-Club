"""Shared helpers for generating recurring event instances."""
import re

from database import Event


def substitute_year(text, old_year, new_year):
    """Replace standalone occurrences of old_year in text with new_year.

    Uses lookarounds instead of \\b so years adjacent to CJK characters
    (e.g. "2026年队际赛") still match.
    """
    if not text or old_year == new_year:
        return text
    return re.sub(rf'(?<!\d){old_year}(?!\d)', str(new_year), text)


def create_event_instance(db, parent_event, occurrence_date):
    """Create a new event instance from a parent recurring event.

    Copies all display fields; mentions of the parent's event year in the
    name and descriptions are rewritten to the occurrence's year, so a
    yearly "2026 Team Champion" generates "2027 Team Champion".
    """
    old_year = parent_event.date.year if parent_event.date else None
    new_year = occurrence_date.year

    def reyear(text):
        return substitute_year(text, old_year, new_year) if old_year else text

    new_event = Event(
        name=reyear(parent_event.name),
        chinese_name=reyear(parent_event.chinese_name),
        date=occurrence_date,
        time=parent_event.time,
        location=parent_event.location,
        chinese_location=parent_event.chinese_location,
        description=reyear(parent_event.description),
        chinese_description=reyear(parent_event.chinese_description),
        image=parent_event.image,
        signup_link=parent_event.signup_link,
        status='Upcoming',
        event_type=parent_event.event_type,
        heylo_embed=parent_event.heylo_embed,
        is_recurring=False,  # Instance is not itself recurring
        parent_event_id=parent_event.id
    )

    db.add(new_event)
    return new_event
