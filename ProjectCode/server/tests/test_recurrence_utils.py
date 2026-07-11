"""Tests for utils/recurrence.py — year substitution and shared instance creation."""
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

from database import Event
from tests.helpers_events import make_event
from utils.recurrence import create_event_instance, substitute_year


# ---------------------------------------------------------------------------
# substitute_year
# ---------------------------------------------------------------------------

def test_substitute_year_replaces_standalone_year():
    assert substitute_year('2026 Team Champion', 2026, 2027) == '2027 Team Champion'


def test_substitute_year_replaces_all_occurrences():
    assert substitute_year('2026 Gala — register for 2026 now', 2026, 2027) == \
        '2027 Gala — register for 2027 now'


def test_substitute_year_works_adjacent_to_cjk():
    # \b would fail here: CJK chars are word chars, so there is no word
    # boundary between the digits and 年 — lookarounds must still match.
    assert substitute_year('2026年布鲁克林半马', 2026, 2027) == '2027年布鲁克林半马'
    assert substitute_year('第2026届年会', 2026, 2027) == '第2027届年会'


def test_substitute_year_ignores_longer_digit_runs():
    assert substitute_year('confirmation 120261', 2026, 2027) == 'confirmation 120261'
    assert substitute_year('bib 20265', 2026, 2027) == 'bib 20265'
    assert substitute_year('id 12026', 2026, 2027) == 'id 12026'


def test_substitute_year_none_text_returns_none():
    assert substitute_year(None, 2026, 2027) is None


def test_substitute_year_empty_text_returns_empty():
    assert substitute_year('', 2026, 2027) == ''


def test_substitute_year_same_year_is_noop():
    assert substitute_year('2026 Run', 2026, 2026) == '2026 Run'


def test_substitute_year_no_match_leaves_text_unchanged():
    assert substitute_year('Weekly Fun Run', 2026, 2027) == 'Weekly Fun Run'


# ---------------------------------------------------------------------------
# create_event_instance
# ---------------------------------------------------------------------------

def test_create_event_instance_copies_fields_and_links_parent(db_session):
    parent = make_event(
        db_session,
        name='Weekly Run',
        chinese_name='每周跑',
        event_date=date(2026, 7, 1),
        time='8:00 AM',
        location='Central Park',
        chinese_location='中央公园',
        description='Easy run',
        chinese_description='轻松跑',
        image='run.jpg',
        signup_link='https://signup.test',
        event_type='heylo',
        heylo_embed='<embed/>',
        is_recurring=True,
    )

    instance = create_event_instance(db_session, parent, date(2026, 7, 8))
    db_session.commit()
    db_session.refresh(instance)

    assert instance.id != parent.id
    assert instance.parent_event_id == parent.id
    assert instance.date == date(2026, 7, 8)
    assert instance.status == 'Upcoming'
    assert instance.is_recurring is False  # instance is not itself recurring
    for field in ('name', 'chinese_name', 'time', 'location', 'chinese_location',
                  'description', 'chinese_description', 'image', 'signup_link',
                  'event_type', 'heylo_embed'):
        assert getattr(instance, field) == getattr(parent, field)


def test_create_event_instance_rewrites_year_in_text_fields(db_session):
    parent = make_event(
        db_session,
        name='2026 Team Champion',
        chinese_name='2026年队际赛',
        event_date=date(2026, 11, 21),
        description='Join the 2026 championship',
        chinese_description='欢迎参加2026年队际赛',
        is_recurring=True,
    )

    instance = create_event_instance(db_session, parent, date(2027, 11, 20))
    db_session.commit()
    db_session.refresh(instance)

    assert instance.name == '2027 Team Champion'
    assert instance.chinese_name == '2027年队际赛'
    assert instance.description == 'Join the 2027 championship'
    assert instance.chinese_description == '欢迎参加2027年队际赛'
    assert instance.date == date(2027, 11, 20)


def test_create_event_instance_same_year_keeps_names(db_session):
    parent = make_event(db_session, name='2026 Spring 5K', event_date=date(2026, 4, 1),
                        is_recurring=True)
    instance = create_event_instance(db_session, parent, date(2026, 4, 8))
    db_session.commit()
    db_session.refresh(instance)
    assert instance.name == '2026 Spring 5K'


def test_create_event_instance_year_not_in_name_unchanged(db_session):
    parent = make_event(db_session, name='Weekly Fun Run', chinese_name='欢乐跑',
                        event_date=date(2026, 12, 30), is_recurring=True)
    instance = create_event_instance(db_session, parent, date(2027, 1, 6))
    db_session.commit()
    db_session.refresh(instance)
    assert instance.name == 'Weekly Fun Run'
    assert instance.chinese_name == '欢乐跑'


def test_create_event_instance_parent_without_date_skips_substitution():
    # Defensive branch: a parent with no date has no year to rewrite.
    parent = SimpleNamespace(
        id=42, name='2026 Run', chinese_name=None, date=None, time=None,
        location=None, chinese_location=None, description=None,
        chinese_description=None, image=None, signup_link=None,
        event_type='standard', heylo_embed=None,
    )
    db = MagicMock()

    instance = create_event_instance(db, parent, date(2027, 1, 6))

    assert isinstance(instance, Event)
    assert instance.name == '2026 Run'  # no substitution without a parent year
    assert instance.parent_event_id == 42
    assert instance.date == date(2027, 1, 6)
    db.add.assert_called_once_with(instance)
