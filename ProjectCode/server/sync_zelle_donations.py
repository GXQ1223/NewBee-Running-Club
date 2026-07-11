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


def parse_zelle_email(raw_email):
    """
    Parse a raw Chase Zelle notification email into structured data.

    Args:
        raw_email: Raw email bytes

    Returns:
        Dictionary with parsed fields, or None if parsing fails
    """
    msg = email.message_from_bytes(raw_email)

    # Get email body
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
        body = msg.get_payload(decode=True).decode(charset, errors="replace")

    if not body:
        return None

    # Strip HTML to plain text for regex parsing
    text = strip_html(body)

    # Verify this is a "sent you" (incoming) Zelle notification
    if "sent you" not in text.lower():
        return None

    # Extract sender name: "FIRSTNAME LASTNAME sent you"
    sender_match = re.search(r'([A-Z][A-Z\s\-\'\.]+?)\s+sent\s+you', text)
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


def is_duplicate(session, transaction_number):
    """
    Check if a donation with this transaction number already exists.

    Args:
        session: SQLAlchemy session
        transaction_number: Zelle transaction number string

    Returns:
        True if duplicate found
    """
    if not transaction_number:
        return False

    existing = session.query(Donor).filter(
        Donor.notes.contains(transaction_number)
    ).first()

    return existing is not None


def build_email_excerpt(parsed_data):
    """Build a human-readable summary of the source Zelle email."""
    parts = [
        f"Zelle payment received — {parsed_data['sender_name']} sent you "
        f"${parsed_data['amount']}"
    ]
    if parsed_data["donation_date"]:
        parts.append(f"Sent on {parsed_data['donation_date'].strftime('%b %d, %Y')}")
    if parsed_data["transaction_number"]:
        parts.append(f"Transaction #{parsed_data['transaction_number']}")
    if parsed_data["memo"]:
        parts.append(f"Memo: {parsed_data['memo']}")
    return " · ".join(parts)


def build_donor_record(parsed_data, status="pending"):
    """
    Build a Donor table row dict from parsed email data.

    Args:
        parsed_data: Dict from parse_zelle_email()
        status: Ledger status for the new record — 'pending' for the weekly
            sync (committee reviews in the ledger before it goes public),
            'confirmed' for trusted backfills.

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
        "source": f"Zelle ({name})",
        "notes": (
            f"Zelle Transaction #{parsed_data['transaction_number']}"
            if parsed_data["transaction_number"]
            else "Zelle (no transaction #)"
        ),
        "message": parsed_data["memo"],
        "donation_event": "General Support",
        "receipt_confirmed": True,
        "quantity": 1,
        "status": status,
        "email_excerpt": build_email_excerpt(parsed_data),
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


def sync_zelle_donations(since_date=None, fetch_all=False, dry_run=False, status="pending"):
    """
    Main sync function: connect to Gmail, fetch Zelle emails, parse and insert.

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
        mail = connect_to_gmail()
        email_ids = search_zelle_emails(mail, imap_since)
        stats["emails_found"] = len(email_ids)

        for i, eid in enumerate(email_ids, 1):
            try:
                status_code, msg_data = mail.fetch(eid, "(RFC822)")
                if status_code != "OK":
                    print(f"  [{i}] Failed to fetch email ID {eid}")
                    stats["errors"] += 1
                    continue

                raw_email = msg_data[0][1]
                parsed = parse_zelle_email(raw_email)

                if not parsed:
                    print(f"  [{i}] Could not parse (not a Zelle incoming payment)")
                    continue

                stats["parsed"] += 1

                # Check for duplicates
                if is_duplicate(session, parsed["transaction_number"]):
                    print(
                        f"  [{i}] Duplicate: {parsed['sender_name']} "
                        f"${parsed['amount']} on {parsed['donation_date']} "
                        f"(txn #{parsed['transaction_number']})"
                    )
                    stats["duplicates"] += 1
                    continue

                record = build_donor_record(parsed, status=status)

                if dry_run:
                    print(
                        f"  [{i}] Would insert: {record['name']} - "
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
                        f"  [{i}] Inserted: {record['name']} - "
                        f"${record['amount']} on {record['donation_date']}"
                    )

                stats["inserted"] += 1

                # Small delay between inserts to ensure unique timestamps
                time.sleep(0.01)

            except Exception as e:
                print(f"  [{i}] Error processing email: {e}")
                session.rollback()
                stats["errors"] += 1

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
