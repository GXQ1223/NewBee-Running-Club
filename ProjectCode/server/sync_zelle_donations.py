#!/usr/bin/env python3
"""
Zelle Donation Sync Script for NewBee Running Club

Reads Chase Zelle notification emails from Gmail via IMAP, parses donation
details, and inserts them into the donors database table.

Supports backfilling historical donations and ongoing sync.

Usage:
    python3 sync_zelle_donations.py                  # Last 30 days (default)
    python3 sync_zelle_donations.py --since 2024-01-01  # Since specific date
    python3 sync_zelle_donations.py --all             # All historical emails
    python3 sync_zelle_donations.py --dry-run         # Preview without inserting
"""

import argparse
import imaplib
import email
from email.header import decode_header
import re
import time
from datetime import datetime, timedelta
from decimal import Decimal
from html import unescape

import json

from sqlalchemy.orm import sessionmaker
from database import engine, Donor, SiteSetting
import os
from dotenv import load_dotenv

load_dotenv()

# Create session
Session = sessionmaker(bind=engine)

# Gmail IMAP configuration
GMAIL_USER = os.getenv("GMAIL_USER")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")
IMAP_SERVER = "imap.gmail.com"
IMAP_PORT = 993
IMAP_FOLDER = '"NewBee Finance/Chase"'
VENMO_FOLDER = '"NewBee Finance/Venmo"'


def connect_to_gmail():
    """
    Connect to Gmail via IMAP using app password.

    Returns:
        IMAP4_SSL connection object
    """
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        raise ValueError(
            "GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env"
        )

    print(f"Connecting to Gmail as {GMAIL_USER}...")
    mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
    mail.login(GMAIL_USER, GMAIL_APP_PASSWORD)
    mail.select(IMAP_FOLDER, readonly=True)
    print("Connected successfully.")
    return mail


def search_zelle_emails(mail, since_date=None):
    """
    Search for Chase Zelle notification emails.

    Args:
        mail: IMAP connection
        since_date: Optional date string (DD-Mon-YYYY) to filter emails

    Returns:
        List of email IDs
    """
    criteria = '(FROM "no.reply.alerts@chase.com" SUBJECT "Zelle")'
    if since_date:
        criteria = f'(FROM "no.reply.alerts@chase.com" SUBJECT "Zelle" SINCE {since_date})'

    print(f"Searching emails with criteria: {criteria}")
    status, data = mail.search(None, criteria)

    if status != "OK":
        print(f"Search failed with status: {status}")
        return []

    email_ids = data[0].split()
    print(f"Found {len(email_ids)} Zelle email(s).")
    return email_ids


def search_venmo_emails(mail, since_date=None):
    """
    Search for incoming Venmo payment notification emails.

    Venmo sends two different subject formats for a real incoming payment,
    seemingly depending on where the money lands (instant transfer vs the
    Venmo balance): "X paid you $Y" and "X paid $Y to your Venmo account.
    Leave it in Venmo or transfer it to your bank account." — both must be
    searched for, or the second form is silently invisible to sync.

    Args:
        mail: IMAP connection (with the Venmo folder selected)
        since_date: Optional date string (DD-Mon-YYYY) to filter emails

    Returns:
        List of email IDs
    """
    subject_or = '(OR (SUBJECT "paid you") (SUBJECT "to your Venmo account"))'
    criteria = f'(FROM "venmo@venmo.com") {subject_or}'
    if since_date:
        criteria = f'(FROM "venmo@venmo.com") (SINCE {since_date}) {subject_or}'

    print(f"Searching emails with criteria: {criteria}")
    status, data = mail.search(None, criteria)

    if status != "OK":
        print(f"Search failed with status: {status}")
        return []

    email_ids = data[0].split()
    print(f"Found {len(email_ids)} Venmo email(s).")
    return email_ids


def strip_html(html_text):
    """Remove HTML tags and decode entities from text."""
    # Remove style/script blocks
    text = re.sub(r'<style[^>]*>.*?</style>', '', html_text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
    # Replace <br> and block elements with newlines
    text = re.sub(r'<br\s*/?\s*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</(p|div|tr|td|th|li|h[1-6])>', '\n', text, flags=re.IGNORECASE)
    # Remove remaining tags
    text = re.sub(r'<[^>]+>', ' ', text)
    # Decode HTML entities
    text = unescape(text)
    # Collapse whitespace (but keep newlines)
    text = re.sub(r'[^\S\n]+', ' ', text)
    # Collapse multiple newlines
    text = re.sub(r'\n\s*\n', '\n', text)
    return text.strip()


def _get_email_body(msg):
    """Extract the decoded body from an email message, preferring HTML."""
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type == "text/html":
                charset = part.get_content_charset() or "utf-8"
                body = part.get_payload(decode=True).decode(charset, errors="replace")
                break
            elif content_type == "text/plain" and not body:
                charset = part.get_content_charset() or "utf-8"
                body = part.get_payload(decode=True).decode(charset, errors="replace")
    else:
        charset = msg.get_content_charset() or "utf-8"
        payload = msg.get_payload(decode=True)
        if payload is not None:
            body = payload.decode(charset, errors="replace")
    return body


def _decode_subject(msg):
    """Decode a possibly RFC 2047-encoded Subject header to a string."""
    decoded = ""
    for value, charset in decode_header(msg.get("Subject", "")):
        if isinstance(value, bytes):
            decoded += value.decode(charset or "utf-8", errors="replace")
        else:
            decoded += value
    return decoded


def _date_from_header(msg):
    """Donation date from the email Date header, today as a last resort."""
    try:
        return email.utils.parsedate_to_datetime(msg.get("Date", "")).date()
    except Exception:
        return datetime.now().date()


def parse_zelle_email(raw_email):
    """
    Parse a raw Chase Zelle notification email into structured data.

    Args:
        raw_email: Raw email bytes

    Returns:
        Dictionary with parsed fields, or None if parsing fails
    """
    msg = email.message_from_bytes(raw_email)

    body = _get_email_body(msg)
    if not body:
        return None

    # Strip HTML to plain text for regex parsing
    text = strip_html(body)

    # Verify this is a "sent you" (incoming) Zelle notification
    if "sent you" not in text.lower():
        return None

    # Extract sender name: "FIRSTNAME LASTNAME sent you". Chase doesn't
    # consistently render this in caps — "JIAN SHEN", "Kanglin Yu", and
    # "JINLING zhang" all occur — so the match must be case-insensitive or
    # any non-uppercase name silently fails to parse.
    #
    # The character class uses a literal space, NOT \s, deliberately: every
    # real email's body reads "Zelle (r) payment\n{NAME} sent you money" —
    # with \s (which matches newlines) and IGNORECASE together, "payment"
    # itself satisfies [A-Z], and since re.search returns the leftmost
    # match, the engine prefers starting at "payment" and bridges the
    # newline straight into the real name (e.g. "Payment\n Juan Du"
    # instead of "Juan Du"). A newline can never appear inside a real
    # sender name, so excluding it keeps the match on a single line.
    sender_match = re.search(r'([A-Z][A-Z \-\'\.]+?)\s+sent\s+you', text, re.IGNORECASE)
    if not sender_match:
        return None
    sender_name = sender_match.group(1).strip().title()

    # Extract amount
    amount_match = re.search(r'Amount\s*.*?\$([\d,]+\.?\d*)', text, re.DOTALL)
    if not amount_match:
        # Try alternate pattern
        amount_match = re.search(r'\$([\d,]+\.?\d*)', text)
    if not amount_match:
        return None
    amount = Decimal(amount_match.group(1).replace(",", ""))

    # Extract date
    date_match = re.search(
        r'Sent\s+on\s*.*?([A-Z][a-z]{2}\s+\d{1,2},\s*\d{4})', text, re.DOTALL
    )
    donation_date = None
    if date_match:
        try:
            donation_date = datetime.strptime(
                date_match.group(1).strip(), "%b %d, %Y"
            ).date()
        except ValueError:
            pass

    # Fallback to email Date header
    if not donation_date:
        date_header = msg.get("Date", "")
        try:
            parsed = email.utils.parsedate_to_datetime(date_header)
            donation_date = parsed.date()
        except Exception:
            donation_date = datetime.now().date()

    # Extract transaction number
    txn_match = re.search(r'Transaction\s+(?:number|#)\s*[:\s]*(\d+)', text, re.IGNORECASE)
    transaction_number = txn_match.group(1) if txn_match else None

    # Extract memo (appears after "Memo\n", grab text up to the next line
    # which contains "{NAME} is registered with")
    memo = None
    memo_match = re.search(r'Memo\n\s*(.*?)\n', text)
    if memo_match:
        memo_text = memo_match.group(1).strip()
        if memo_text and memo_text.upper() != "N/A":
            memo = memo_text

    return {
        "sender_name": sender_name,
        "amount": amount,
        "donation_date": donation_date,
        "transaction_number": transaction_number,
        "memo": memo,
    }


def _extract_venmo_memo(text):
    """
    Pull the payment note from a stripped Venmo email body.

    Real Venmo emails render as: a title/preheader line ("X paid you $15.00",
    sometimes duplicated), then the card heading "X paid you", the amount
    split across lines ("$" / "15" / ". 00"), the note, and the
    "See transaction" button. The note is whatever sits between the LAST
    "paid you" heading and the first stop marker, skipping amount fragments.
    """
    lines = [line.strip() for line in text.split('\n')]

    stop_markers = ('see transaction', 'money credited', 'payment id',
                    'transfer', 'for any issues', 'transaction details')
    stop = len(lines)
    for i, line in enumerate(lines):
        if any(line.lower().startswith(marker) for marker in stop_markers):
            stop = i
            break

    start = None
    heading_idx = -1
    for i in range(stop - 1, -1, -1):
        heading_idx = lines[i].lower().find('paid you')
        if heading_idx != -1:
            start = i
            break
    if start is None:
        return None

    memo_lines = []
    # The note may sit inline after "paid you" on the heading line itself,
    # minus any leading amount fragment like "$15.00" / "$15 00"
    remainder = re.sub(
        r'^[\$\d.,\s]+', '', lines[start][heading_idx + len('paid you'):].strip()
    )
    if remainder:
        memo_lines.append(remainder.strip())

    for line in lines[start + 1:stop]:
        # Skip blanks and standalone amount fragments ("$", "15", ". 00")
        if not line or re.fullmatch(r'[\$\d.,\s]+', line):
            continue
        memo_lines.append(line)

    memo = ' '.join(memo_lines).strip()
    return memo or None


def parse_venmo_email(raw_email):
    """
    Parse a raw Venmo payment notification email into structured data.

    Venmo puts the payer and amount in the subject and the payment note in
    the body. Two subject formats carry a real incoming payment — which one
    arrives seems to depend on whether the money lands as an instant
    transfer or in the Venmo balance: "Xiao Yang paid you $15.00", or
    "Xiao Yang paid $15.00 to your Venmo account. Leave it in Venmo or
    transfer it to your bank account." Both must be tried, or the second
    form silently returns no donation. Dedup uses the transaction id from
    the "See transaction" link, falling back to the email Message-ID.

    Args:
        raw_email: Raw email bytes

    Returns:
        Dictionary with parsed fields, or None if parsing fails
    """
    msg = email.message_from_bytes(raw_email)

    subject = _decode_subject(msg)
    subject_match = re.search(r'(.+?)\s+paid\s+you\s+\$([\d,]+\.?\d*)', subject)
    if not subject_match:
        subject_match = re.search(
            r'(.+?)\s+paid\s+\$([\d,]+\.?\d*)\s+to\s+your\s+Venmo\s+account', subject
        )
    if not subject_match:
        return None
    sender_name = subject_match.group(1).strip()
    amount = Decimal(subject_match.group(2).replace(",", ""))

    body = _get_email_body(msg)
    text = strip_html(body) if body else ''
    memo = _extract_venmo_memo(text) if text else None

    # Transaction id: the "Transaction ID" field in the body, else the id in
    # the "See transaction" link, else the email Message-ID. IDs are
    # numeric on the standard "paid you" notification but alphanumeric
    # (PayPal-style, e.g. "7R4007699Y124851X") on the "paid $Y to your
    # Venmo account" notification — a digits-only pattern here truncates
    # the latter to its leading digit or two, which then spuriously
    # dedup-matches against unrelated donations sharing that short digit
    # string in their notes.
    txn_match = re.search(r'Transaction\s+ID\s*\n\s*([A-Za-z0-9]+)', text, re.IGNORECASE)
    if not txn_match:
        txn_match = re.search(
            r'venmo\.com/(?:story|payment)s?/([A-Za-z0-9_\-]+)', body or ''
        )
    if txn_match:
        transaction_number = txn_match.group(1)
    else:
        transaction_number = (msg.get("Message-ID") or "").strip().strip("<>") or None

    return {
        "sender_name": sender_name,
        "amount": amount,
        "donation_date": _date_from_header(msg),
        "transaction_number": transaction_number,
        "memo": memo,
    }


# Payments that are almost certainly not donations (carpool fees, team-gear
# purchases). They are still imported — the ledger row is what stops the next
# sync from re-importing the same transaction — but arrive pre-ignored so the
# committee doesn't dismiss them one by one. The ledger's Approve button
# flips any false positive.
AUTO_IGNORE_MEMO_KEYWORDS = [
    '拼车', 'carpool', '车费', '🚗',
    '队服', '衣服', 't-shirt', 'tshirt', 't shirt', 'tee', 'shirt', 'jersey',
]


def auto_ignore_keyword(memo):
    """Return the matched keyword if the memo marks a non-donation payment."""
    if not memo:
        return None
    lowered = memo.lower()
    for keyword in AUTO_IGNORE_MEMO_KEYWORDS:
        if keyword in lowered:
            return keyword
    return None


#  Real transaction numbers are always well above this — Zelle ~11 digits,
# Venmo numeric IDs ~19 digits, Venmo alphanumeric IDs ~17 chars. A short
# value here means a parsing regex grabbed a fragment, not a real ID; used
# for substring dedup, a short value matches almost any unrelated note.
MIN_TRANSACTION_NUMBER_LENGTH = 6


def is_duplicate(session, transaction_number):
    """
    Check if a donation with this transaction number already exists.

    Args:
        session: SQLAlchemy session
        transaction_number: Zelle transaction number string

    Returns:
        True if duplicate found
    """
    if not transaction_number or len(transaction_number) < MIN_TRANSACTION_NUMBER_LENGTH:
        return False

    existing = session.query(Donor).filter(
        Donor.notes.contains(transaction_number)
    ).first()

    return existing is not None


def build_email_excerpt(parsed_data, provider="Zelle"):
    """Build a human-readable summary of the source payment email."""
    parts = [
        f"{provider} payment received — {parsed_data['sender_name']} sent you "
        f"${parsed_data['amount']}"
    ]
    if parsed_data["donation_date"]:
        parts.append(f"Sent on {parsed_data['donation_date'].strftime('%b %d, %Y')}")
    if parsed_data["transaction_number"]:
        parts.append(f"Transaction #{parsed_data['transaction_number']}")
    if parsed_data["memo"]:
        parts.append(f"Memo: {parsed_data['memo']}")
    return " · ".join(parts)


def build_donor_record(parsed_data, status="pending", provider="Zelle"):
    """
    Build a Donor table row dict from parsed email data.

    Args:
        parsed_data: Dict from parse_zelle_email() / parse_venmo_email()
        status: Ledger status for the new record — 'pending' for the weekly
            sync (committee reviews in the ledger before it goes public),
            'confirmed' for trusted backfills.
        provider: Payment provider name ('Zelle' or 'Venmo'), used in the
            source/notes/excerpt strings.

    Returns:
        Dict ready for Donor(**record) insertion
    """
    timestamp_ms = int(time.time() * 1000)
    name = parsed_data["sender_name"]

    record = {
        "donor_id": f"IND_{timestamp_ms}",
        "name": name,
        "donor_type": "individual",
        "amount": parsed_data["amount"],
        "donation_date": parsed_data["donation_date"],
        "source": f"{provider} ({name})",
        "notes": (
            f"{provider} Transaction #{parsed_data['transaction_number']}"
            if parsed_data["transaction_number"]
            else f"{provider} (no transaction #)"
        ),
        "message": parsed_data["memo"],
        "donation_event": "General Support",
        "receipt_confirmed": True,
        "quantity": 1,
        "status": status,
        "email_excerpt": build_email_excerpt(parsed_data, provider=provider),
    }
    return record


def record_sync_status(stats):
    """
    Persist last-run info to site_settings so the admin ledger can show
    sync health without shelling into the server.
    """
    session = Session()
    try:
        values = {
            "donation_sync_last_run": datetime.utcnow().isoformat(),
            "donation_sync_last_result": json.dumps(stats),
        }
        for key, value in values.items():
            setting = session.query(SiteSetting).filter(SiteSetting.key == key).first()
            if not setting:
                setting = SiteSetting(
                    key=key,
                    value=value,
                    label_en="Donation Gmail Sync",
                    label_cn="捐款邮件同步",
                    category="donors",
                    is_active=True,
                )
                session.add(setting)
            else:
                setting.value = value
        session.commit()
    finally:
        session.close()


def _process_provider_emails(mail, email_ids, parser, provider, session, stats,
                             dry_run, status):
    """
    Fetch, parse, dedup and insert one provider's emails, updating stats.

    Args:
        mail: IMAP connection with the provider's folder selected
        email_ids: IMAP message ids to process
        parser: parse_zelle_email or parse_venmo_email
        provider: 'Zelle' or 'Venmo' (used in source/notes/excerpt strings)
        session: SQLAlchemy session
        stats: Mutable stats dict shared across providers
        dry_run: If True, print results without inserting
        status: Ledger status for inserted rows
    """
    for i, eid in enumerate(email_ids, 1):
        try:
            status_code, msg_data = mail.fetch(eid, "(RFC822)")
            if status_code != "OK":
                print(f"  [{provider} {i}] Failed to fetch email ID {eid}")
                stats["errors"] += 1
                continue

            raw_email = msg_data[0][1]
            parsed = parser(raw_email)

            if not parsed:
                print(f"  [{provider} {i}] Could not parse (not an incoming payment)")
                continue

            stats["parsed"] += 1

            # Check for duplicates
            if is_duplicate(session, parsed["transaction_number"]):
                print(
                    f"  [{provider} {i}] Duplicate: {parsed['sender_name']} "
                    f"${parsed['amount']} on {parsed['donation_date']} "
                    f"(txn #{parsed['transaction_number']})"
                )
                stats["duplicates"] += 1
                continue

            record = build_donor_record(parsed, status=status, provider=provider)

            # Non-donation payments (carpool, gear) come in pre-ignored,
            # regardless of the requested status — even confirmed backfills
            # shouldn't publish a carpool fee as a donation
            matched = auto_ignore_keyword(parsed["memo"])
            if matched:
                record["status"] = "dismissed"
                # Two-layer books: carpool money is pass-through, gear
                # payments are event revenue
                lowered = matched.lower()
                if lowered in ('拼车', 'carpool', '车费', '🚗'):
                    record["income_type"] = "pass_through"
                else:
                    record["income_type"] = "event_revenue"
                record["event_code"] = 1001
                record["notes"] += f" · Auto-ignored 自动忽略: memo matched '{matched}'"

            if dry_run:
                print(
                    f"  [{provider} {i}] Would insert ({record['status']}): "
                    f"{record['name']} - "
                    f"${record['amount']} on {record['donation_date']} "
                    f"| source: {record['source']} "
                    f"| notes: {record['notes']}"
                    f"{' | memo: ' + record['message'] if record['message'] else ''}"
                )
            else:
                donor = Donor(**record)
                session.add(donor)
                session.commit()
                print(
                    f"  [{provider} {i}] Inserted ({record['status']}): "
                    f"{record['name']} - "
                    f"${record['amount']} on {record['donation_date']}"
                )

            stats["inserted"] += 1

            # Small delay between inserts to ensure unique timestamps
            time.sleep(0.01)

        except Exception as e:
            print(f"  [{provider} {i}] Error processing email: {e}")
            session.rollback()
            stats["errors"] += 1


def sync_zelle_donations(since_date=None, fetch_all=False, dry_run=False, status="pending"):
    """
    Main sync function: connect to Gmail, fetch Zelle and Venmo payment
    emails, parse and insert.

    Args:
        since_date: Optional YYYY-MM-DD string
        fetch_all: If True, fetch all historical emails (no date filter)
        dry_run: If True, print results without inserting
        status: Status for inserted rows — 'pending' (default, reviewed in
            the admin ledger before publishing) or 'confirmed' (backfill)

    Returns:
        Dict with sync statistics
    """
    stats = {
        "emails_found": 0,
        "parsed": 0,
        "duplicates": 0,
        "inserted": 0,
        "errors": 0,
    }

    # Determine IMAP date filter
    imap_since = None
    if not fetch_all:
        if since_date:
            dt = datetime.strptime(since_date, "%Y-%m-%d")
        else:
            dt = datetime.now() - timedelta(days=30)
        # IMAP date format: DD-Mon-YYYY
        imap_since = dt.strftime("%d-%b-%Y")

    mail = None
    session = Session()

    try:
        mail = connect_to_gmail()  # logs in and selects the Zelle folder
        zelle_ids = search_zelle_emails(mail, imap_since)
        stats["emails_found"] += len(zelle_ids)
        _process_provider_emails(mail, zelle_ids, parse_zelle_email, "Zelle",
                                 session, stats, dry_run, status)

        # Venmo notifications live in a separate Gmail label
        try:
            select_status, _ = mail.select(VENMO_FOLDER, readonly=True)
        except Exception as e:
            select_status = "NO"
            print(f"Venmo folder unavailable, skipping: {e}")
        if select_status == "OK":
            venmo_ids = search_venmo_emails(mail, imap_since)
            stats["emails_found"] += len(venmo_ids)
            _process_provider_emails(mail, venmo_ids, parse_venmo_email, "Venmo",
                                     session, stats, dry_run, status)
        else:
            print(f"Could not select {VENMO_FOLDER}, skipping Venmo sync.")

    except Exception as e:
        print(f"\nSync error: {e}")
        stats["errors"] += 1

    finally:
        if mail:
            try:
                mail.close()
                mail.logout()
            except Exception:
                pass
        session.close()

    if not dry_run:
        try:
            record_sync_status(stats)
        except Exception as e:
            print(f"Warning: could not record sync status: {e}")

    return stats


def main():
    """CLI entry point with argparse."""
    parser = argparse.ArgumentParser(
        description="Sync Zelle donations from Gmail to database"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be inserted without writing to DB",
    )
    parser.add_argument(
        "--since",
        type=str,
        metavar="YYYY-MM-DD",
        help="Only process emails after this date",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        dest="fetch_all",
        help="Process all historical emails (no date filter)",
    )
    parser.add_argument(
        "--confirmed",
        action="store_true",
        help="Insert directly as confirmed (skip the pending review queue); "
        "use for trusted historical backfills",
    )

    args = parser.parse_args()

    print("=" * 70)
    print("Zelle Donation Sync - NewBee Running Club")
    print("=" * 70)

    if args.dry_run:
        print("MODE: Dry run (no database writes)\n")
    else:
        print("MODE: Live (will insert into database)\n")

    stats = sync_zelle_donations(
        since_date=args.since,
        fetch_all=args.fetch_all,
        dry_run=args.dry_run,
        status="confirmed" if args.confirmed else "pending",
    )

    print("\n" + "=" * 70)
    print("Sync Summary")
    print("=" * 70)
    print(f"  Emails found:     {stats['emails_found']}")
    print(f"  Parsed:           {stats['parsed']}")
    print(f"  Duplicates:       {stats['duplicates']}")
    print(f"  {'Would insert' if args.dry_run else 'Inserted'}:      {stats['inserted']}")
    print(f"  Errors:           {stats['errors']}")

    if stats["errors"] > 0:
        exit(1)
    exit(0)


if __name__ == "__main__":
    main()
