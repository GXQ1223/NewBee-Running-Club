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

Dedup is hardened in layers, all inside `_apply_sync`: each payload
is deduplicated before it is applied (repeated Heylo URLs — or, for
link-less items, repeated date + normalized title — are merged
keeping the most complete record); an item pushed without a link
falls back to matching an existing event on date + normalized title
instead of blindly inserting; and the whole apply runs serialized
under a process-wide lock in a single transaction, so the button, the
manual endpoint and the daily scheduler job cannot race each other
into creating duplicates.

POST /sync-now is the server-side variant used by the Admin Panel
button: this module fetches the Heylo group page itself (the pages are
server-rendered Next.js and embed their data as JSON in a
`__NEXT_DATA__` script tag, so a plain HTTP GET suffices — no browser
or Heylo login needed), follows each listed event to its own page for
location/description, and feeds the parsed activities through the same
upsert logic as POST /sync.
"""
import json
import re
import threading
from datetime import date as date_type, datetime
from typing import List, Optional, Tuple
from zoneinfo import ZoneInfo

import requests
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db, Event, Member
from models import (
    HeyloActivityItem,
    HeyloSyncRequest,
    HeyloSyncResponse,
    HeyloSyncNowChange,
    HeyloSyncNowResponse,
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

# Serializes _apply_sync within this process. The button-triggered
# /sync-now, the manual /sync endpoint and the daily scheduler job can
# all fire at once, and check-then-insert only stays duplicate-free if
# the existence check, the write and the commit happen atomically
# in-process. (Residual risk: a deployment running multiple server
# processes would need a database unique constraint for the same
# guarantee — see the PR notes; the app runs as a single process.)
_APPLY_LOCK = threading.Lock()


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
    return _apply_sync(db, payload.activities)


def _normalize_link(link) -> Optional[str]:
    """Canonical form of a sync item's signup link (blank -> None)."""
    if not isinstance(link, str):
        return None
    return link.strip() or None


def _normalize_name(name) -> str:
    """Title comparison key: whitespace-collapsed and case-folded."""
    return ' '.join((name or '').split()).casefold()


def _completeness(item) -> int:
    """How much data an item carries — decides which duplicate is kept."""
    score = sum(1 for field in _SYNC_FIELDS if getattr(item, field) is not None)
    return score + (1 if item.status is not None else 0)


def _merge_items(base, extra):
    """Fill base's not-provided (None) fields from extra; base wins otherwise."""
    fills = {
        field: getattr(extra, field)
        for field in _SYNC_FIELDS + ('status',)
        if getattr(base, field) is None and getattr(extra, field) is not None
    }
    return base.model_copy(update=fills) if fills else base


def _dedupe_activities(
    activities: List[HeyloActivityItem],
) -> List[HeyloActivityItem]:
    """Collapse repeated activities inside one sync list.

    The same Heylo event can appear twice in a single payload (a
    checker re-reading the group, the group listing an event twice).
    Items are keyed by signup link — or, for link-less items, by date
    + normalized title — and duplicates are merged keeping the most
    complete record, so one list can never create two rows (or two
    result entries) for the same activity.
    """
    by_key = {}
    order = []
    for item in activities:
        link = _normalize_link(item.signup_link)
        if link:
            key = ('link', link)
        else:
            key = ('title', item.date, _normalize_name(item.name))
        if key not in by_key:
            by_key[key] = item
            order.append(key)
            continue
        kept = by_key[key]
        if _completeness(item) > _completeness(kept):
            kept, item = item, kept
        by_key[key] = _merge_items(kept, item)
    return [by_key[key] for key in order]


def _find_existing(db: Session, item, link: Optional[str]):
    """Locate the website event a sync item refers to, if any.

    Primary key is the Heylo URL (`signup_link`). Link-less items fall
    back to the same date + normalized title among heylo events, so a
    re-push without a link updates the existing event instead of
    duplicating it.
    """
    if link:
        return (
            db.query(Event)
            .filter(
                Event.event_type == 'heylo',
                Event.signup_link == link,
            )
            .first()
        )
    target = _normalize_name(item.name)
    candidates = (
        db.query(Event)
        .filter(Event.event_type == 'heylo', Event.date == item.date)
        .order_by(Event.id)
        .all()
    )
    return next(
        (e for e in candidates if _normalize_name(e.name) == target), None
    )


def _apply_sync(db: Session, activities: List[HeyloActivityItem]) -> HeyloSyncResponse:
    """Upsert Heylo activities as website events (shared by /sync and /sync-now).

    The payload is deduplicated first, then applied in a single
    transaction — any failure rolls the whole batch back — under a
    process-wide lock that serializes the existence check + write
    against overlapping callers.
    """
    with _APPLY_LOCK:
        return _apply_sync_deduped(db, _dedupe_activities(activities))


def _apply_sync_deduped(
    db: Session, activities: List[HeyloActivityItem]
) -> HeyloSyncResponse:
    created = updated = unchanged = 0
    results: List[HeyloSyncItemResult] = []

    try:
        for item in activities:
            link = _normalize_link(item.signup_link)
            status_value, highlight_value = _status_pair(item)
            updates = {
                field: getattr(item, field)
                for field in _SYNC_FIELDS
                if getattr(item, field) is not None
            }

            existing = _find_existing(db, item, link)

            if existing is None:
                event = Event(
                    event_type='heylo',
                    signup_link=link,
                    status=status_value,
                    is_highlight=bool(highlight_value),
                    **updates,
                )
                db.add(event)
                db.flush()
                created += 1
                results.append(HeyloSyncItemResult(
                    signup_link=link, event_id=event.id, action='created',
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
                signup_link=link if link is not None else existing.signup_link,
                event_id=existing.id, action=action,
            ))

        db.commit()
    except Exception:
        db.rollback()
        raise
    return HeyloSyncResponse(
        created=created, updated=updated, unchanged=unchanged, results=results,
    )


# ---------------------------------------------------------------------------
# Server-side Heylo fetch + parse (backs POST /sync-now)
#
# Heylo pages are Next.js: the data the page renders is embedded in a
# <script id="__NEXT_DATA__"> JSON blob. The group page's blob lists the
# group's events (id, name, timestamp, image, deepLink); each event
# page's blob carries the full event (location, notes, timezone, ...).
# ---------------------------------------------------------------------------

HEYLO_BASE_URL = 'https://www.heylo.com'
HEYLO_GROUP_ID = 'b7bf1310-ca40-4d4d-9da5-2b7f4f3c197e'
HEYLO_GROUP_URL = f'{HEYLO_BASE_URL}/g/{HEYLO_GROUP_ID}'
HEYLO_CLUB_TIMEZONE = 'America/New_York'

_FETCH_HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
    ),
}
_FETCH_TIMEOUT_SECONDS = 15

_NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
    re.DOTALL,
)


class HeyloFetchError(Exception):
    """Heylo could not be fetched or its pages could not be parsed."""


def _fetch_html(url: str) -> str:
    response = requests.get(url, headers=_FETCH_HEADERS, timeout=_FETCH_TIMEOUT_SECONDS)
    response.raise_for_status()
    return response.text


def _next_data_queries(html: str) -> list:
    """The react-query payloads embedded in a Heylo page (list of state dicts)."""
    match = _NEXT_DATA_RE.search(html)
    if not match:
        return []
    try:
        data = json.loads(match.group(1))
        return data['props']['pageProps']['dehydratedState']['queries']
    except (ValueError, KeyError, TypeError):
        return []


def _parse_group_event_summaries(html: str) -> list:
    """Event summaries listed on the Heylo group page ([] when unparseable)."""
    for query in _next_data_queries(html):
        data = (query.get('state') or {}).get('data')
        if isinstance(data, dict) and isinstance(data.get('events'), list):
            return [e for e in data['events'] if isinstance(e, dict) and e.get('id')]
    return []


def _parse_event_detail(html: str) -> Optional[dict]:
    """The full event object embedded in a Heylo event page, or None."""
    for query in _next_data_queries(html):
        data = (query.get('state') or {}).get('data')
        if isinstance(data, dict) and isinstance(data.get('event'), dict):
            return data['event']
    return None


def _clean(value) -> Optional[str]:
    """Strip a Heylo text field; empty strings become None ('not provided')."""
    if not isinstance(value, str):
        return None
    return value.strip() or None


def _event_to_item(event: dict, event_id: str) -> HeyloActivityItem:
    """Convert one Heylo event object into a sync item.

    Heylo gives a millisecond epoch `timestamp` plus an IANA `timezone`;
    the website wants a local date and a 12-hour start time ('7:30 AM',
    matching how event times are stored elsewhere). Heylo's free-text
    `location` and `notes` map to the website's location/description.
    """
    tz = ZoneInfo(event.get('timezone') or HEYLO_CLUB_TIMEZONE)
    start = datetime.fromtimestamp(event['timestamp'] / 1000, tz=tz)
    hour = start.strftime('%I').lstrip('0') or '12'
    image = _clean(event.get('image'))
    cancelled = any(
        event.get(key) for key in ('isCancelled', 'cancelled', 'isCanceled', 'canceled')
    )
    return HeyloActivityItem(
        name=str(event.get('name') or '').strip()[:255],
        date=start.date(),
        time=f'{hour}:{start:%M} {start:%p}',
        location=(_clean(event.get('location')) or '')[:255] or None,
        description=_clean(event.get('notes')),
        image=image if image and len(image) <= 500 else None,
        signup_link=f'{HEYLO_BASE_URL}/event/{event_id}',
        status='Cancelled' if cancelled else None,
    )


def _fetch_heylo_activities(today: Optional[date_type] = None) -> List[HeyloActivityItem]:
    """Fetch the club's upcoming Heylo activities, ready for _apply_sync.

    Follows each event listed on the group page to its own page for the
    fields the listing lacks (location, description). Drafts and events
    whose local date has passed are skipped. Raises HeyloFetchError (or
    lets requests exceptions bubble) on any fetch/parse failure — the
    caller writes nothing in that case.
    """
    if today is None:
        today = datetime.now(ZoneInfo(HEYLO_CLUB_TIMEZONE)).date()

    group_html = _fetch_html(HEYLO_GROUP_URL)
    summaries = _parse_group_event_summaries(group_html)
    if not summaries:
        raise HeyloFetchError('No events found on the Heylo group page.')

    items: List[HeyloActivityItem] = []
    seen_ids = set()
    for summary in summaries:
        event_id = summary['id']
        if event_id in seen_ids:
            continue
        seen_ids.add(event_id)
        detail_html = _fetch_html(f'{HEYLO_BASE_URL}/event/{event_id}')
        event = _parse_event_detail(detail_html)
        if event is None:
            raise HeyloFetchError(f'Could not parse Heylo event {event_id}.')
        if event.get('isDraft'):
            continue
        item = _event_to_item(event, event_id)
        if item.date < today:
            continue
        items.append(item)
    return items


@router.post("/sync-now", response_model=HeyloSyncNowResponse)
def sync_heylo_now(
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin),
):
    """Fetch the Heylo group server-side and sync it now (committee/admin).

    Backs the Admin Panel 'Sync Heylo events' button. On any fetch or
    parse failure — including finding no upcoming activities — returns
    502 and writes nothing.
    """
    try:
        activities = _fetch_heylo_activities()
    except (HeyloFetchError, requests.RequestException) as exc:
        raise HTTPException(
            status_code=502,
            detail=f'Failed to read Heylo: {exc}',
        )
    if not activities:
        raise HTTPException(
            status_code=502,
            detail='No upcoming Heylo activities found; nothing was synced.',
        )

    result = _apply_sync(db, activities)
    by_link = {_normalize_link(item.signup_link): item for item in activities}
    changes = [
        HeyloSyncNowChange(
            name=by_link[r.signup_link].name,
            date=by_link[r.signup_link].date,
            action=r.action,
        )
        for r in result.results
        if r.action in ('created', 'updated')
    ]
    return HeyloSyncNowResponse(
        created=result.created,
        updated=result.updated,
        unchanged=result.unchanged,
        results=result.results,
        changes=changes,
    )
