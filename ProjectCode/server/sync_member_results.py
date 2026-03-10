#!/usr/bin/env python3
"""
NYRR Member Results Sync Script for NewBee Running Club
Syncs race results for registered club members using their NYRR Runner IDs.

This script:
1. Queries all members with NYRR Runner IDs
2. Fetches their race results from NYRR's API
3. Imports results to the database, avoiding duplicates
4. Can be run on a weekly schedule via GitHub Actions

Usage:
    python3 sync_member_results.py              # Sync all members
    python3 sync_member_results.py --member-id 123  # Sync specific member
    python3 sync_member_results.py --dry-run    # Test without writing to DB
"""

import argparse
import requests
import pandas as pd
from datetime import datetime, timezone
from sqlalchemy.orm import sessionmaker
from sqlalchemy import and_
from database import engine, Results, Member
import io
import time
import os
from dotenv import load_dotenv

load_dotenv()

# Create session
Session = sessionmaker(bind=engine)


def fetch_runner_results(runner_id, max_results=100):
    """
    Fetch race results for a specific runner from NYRR API

    Args:
        runner_id: NYRR Runner ID
        max_results: Maximum number of results to fetch

    Returns:
        DataFrame with race results or None if error
    """
    url = "https://results.nyrr.org/api/APICoreService.svc/GetParticipantResults"

    # NYRR API parameters
    params = {
        "sourceId": "1",  # NYRR source
        "participantId": runner_id,
        "page": 1,
        "pageSize": max_results
    }

    try:
        print(f"  Fetching results for runner ID {runner_id}...")
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()

        data = response.json()

        if not data or 'Results' not in data or not data['Results']:
            print(f"  No results found for runner ID {runner_id}")
            return None

        results = data['Results']

        # Convert to DataFrame
        df = pd.DataFrame(results)
        print(f"  Found {len(df)} race results")

        return df

    except Exception as e:
        print(f"  Error fetching results for runner ID {runner_id}: {e}")
        return None


def parse_result_data(result_row, member):
    """
    Parse a result row from NYRR API into database format

    Args:
        result_row: Row from NYRR results DataFrame
        member: Member object from database

    Returns:
        Dictionary with parsed result data
    """
    try:
        # Parse race date/time
        race_date_str = result_row.get('RaceDate', '')
        race_time = datetime.strptime(race_date_str, '%Y-%m-%dT%H:%M:%S') if race_date_str else datetime.now(timezone.utc)

        # Extract race info
        race_name = result_row.get('RaceName', 'Unknown Race')
        race_distance = result_row.get('Distance', '')

        # Extract performance data
        overall_time = result_row.get('Time', '')
        pace = result_row.get('Pace', '')
        gun_time = result_row.get('GunTime', overall_time)  # Fallback to chip time if gun time not available

        # Extract placements
        overall_place = result_row.get('OverallPlace', None)
        gender_place = result_row.get('GenderPlace', None)
        age_group_place = result_row.get('AgeGradePlace', None)

        # Extract other fields
        bib = str(result_row.get('Bib', ''))
        gender_age = result_row.get('AgeGrade', '')  # Format like "M50" or "W35"
        age_graded_time = result_row.get('AgeGradedTime', '')
        age_graded_percent = result_row.get('AgeGradedPercent', None)
        iaaf = result_row.get('Country', '')

        return {
            'name': member.display_name or member.username,
            'overall_place': int(overall_place) if overall_place else None,
            'gender_place': int(gender_place) if gender_place else None,
            'age_group_place': int(age_group_place) if age_group_place else None,
            'bib': bib,
            'gender_age': gender_age,
            'overall_time': overall_time,
            'pace': pace,
            'gun_time': gun_time,
            'age_graded_time': age_graded_time,
            'age_graded_percent': float(age_graded_percent) if age_graded_percent else None,
            'race': race_name.lower(),
            'race_time': race_time,
            'race_distance': race_distance,
            'iaaf': iaaf
        }

    except Exception as e:
        print(f"  Error parsing result: {e}")
        return None


def result_exists(session, name, race, race_time):
    """
    Check if a result already exists in the database

    Args:
        session: Database session
        name: Runner name
        race: Race name
        race_time: Race date/time

    Returns:
        True if result exists, False otherwise
    """
    existing = session.query(Results).filter(
        and_(
            Results.name == name,
            Results.race == race,
            Results.race_time == race_time
        )
    ).first()

    return existing is not None


def sync_member_results(member_id=None, dry_run=False):
    """
    Sync race results for club members

    Args:
        member_id: Specific member ID to sync (None for all members)
        dry_run: If True, don't write to database

    Returns:
        Dictionary with sync statistics
    """
    session = Session()
    stats = {
        'members_processed': 0,
        'members_with_results': 0,
        'new_results': 0,
        'duplicate_results': 0,
        'errors': 0
    }

    try:
        # Get members with NYRR IDs
        query = session.query(Member).filter(
            Member.nyrr_member_id.isnot(None),
            Member.status.in_(['runner', 'admin'])  # Only sync active members
        )

        if member_id:
            query = query.filter(Member.id == member_id)

        members = query.all()

        print(f"\n{'DRY RUN - ' if dry_run else ''}Syncing results for {len(members)} members...\n")

        for member in members:
            stats['members_processed'] += 1
            print(f"[{stats['members_processed']}/{len(members)}] Processing {member.display_name or member.username} (NYRR ID: {member.nyrr_member_id})")

            # Fetch results from NYRR
            results_df = fetch_runner_results(member.nyrr_member_id)

            if results_df is None or len(results_df) == 0:
                print(f"  Skipping - no results found")
                continue

            stats['members_with_results'] += 1

            # Process each result
            for _, result_row in results_df.iterrows():
                result_data = parse_result_data(result_row, member)

                if not result_data:
                    stats['errors'] += 1
                    continue

                # Check if result already exists
                if result_exists(session, result_data['name'], result_data['race'], result_data['race_time']):
                    stats['duplicate_results'] += 1
                    continue

                # Add new result
                if not dry_run:
                    new_result = Results(**result_data)
                    session.add(new_result)

                stats['new_results'] += 1
                print(f"  ✅ New result: {result_data['race']} ({result_data['race_time'].strftime('%Y-%m-%d')})")

            # Commit after each member to avoid losing progress
            if not dry_run:
                session.commit()

            # Be respectful to the API
            time.sleep(1)

        print(f"\n{'DRY RUN ' if dry_run else ''}Sync Complete!")
        print(f"  Members processed: {stats['members_processed']}")
        print(f"  Members with results: {stats['members_with_results']}")
        print(f"  New results imported: {stats['new_results']}")
        print(f"  Duplicate results skipped: {stats['duplicate_results']}")
        print(f"  Errors: {stats['errors']}")

    except Exception as e:
        print(f"\nSync error: {e}")
        session.rollback()
        stats['errors'] += 1

    finally:
        session.close()

    return stats


def main():
    """Main entry point for the script"""
    parser = argparse.ArgumentParser(
        description='Sync NYRR race results for club members'
    )
    parser.add_argument(
        '--member-id',
        type=int,
        help='Specific member ID to sync (omit to sync all members)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Test run without writing to database'
    )

    args = parser.parse_args()

    print("=" * 70)
    print("NYRR Member Results Sync - NewBee Running Club")
    print("=" * 70)

    stats = sync_member_results(
        member_id=args.member_id,
        dry_run=args.dry_run
    )

    # Exit with error code if there were errors
    if stats['errors'] > 0:
        exit(1)

    exit(0)


if __name__ == "__main__":
    main()
