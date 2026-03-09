"""Race results and NYRR sync endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel
import json
import asyncio

from database import get_db, Results, Member
from utils.auth import get_current_committee_or_admin
from utils.time import time_to_seconds

router = APIRouter(prefix="/api/results", tags=["results"])


@router.get("/available-years")
def get_available_years(db: Session = Depends(get_db)):
    """Get list of years that have race data"""
    years = db.query(
        func.extract('year', Results.race_time).label('year')
    ).distinct().order_by(
        func.extract('year', Results.race_time).desc()
    ).all()

    return {"years": [int(year.year) for year in years]}

@router.get("/men-records")
def get_men_records(year: Optional[int] = None, db: Session = Depends(get_db)):
    """Get men's top 10 times for each race distance"""
    if year is not None and (year < 1900 or year > 2100):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid year")
    # Base query for male runners
    query = db.query(Results).filter(
        Results.gender_age.like('M%')  # Filter for male runners
    )

    # Add year filter if specified
    if year:
        query = query.filter(func.extract('year', Results.race_time) == year)

    # Get all results and group by distance
    all_results = query.all()

    # Group by distance and get top 10 for each
    distance_records = {}
    for result in all_results:
        if result.race_distance not in distance_records:
            distance_records[result.race_distance] = []
        distance_records[result.race_distance].append(result)

    # Sort each distance group by time and take top 10
    records = []
    for distance, results in distance_records.items():
        # Sort by overall_time (assuming format allows string comparison)
        sorted_results = sorted(results, key=lambda x: time_to_seconds(x.overall_time) if x.overall_time else float('inf'))[:10]

        for rank, result in enumerate(sorted_results, 1):
            records.append({
                "distance": distance,
                "rank": rank,
                "time": result.overall_time,
                "runner_name": result.name,
                "race_name": result.race,
                "race_date": result.race_time.strftime('%Y-%m-%d'),
                "age_group": result.gender_age,
                "pace": result.pace
            })

    return {"men_records": records}

@router.get("/women-records")
def get_women_records(year: Optional[int] = None, db: Session = Depends(get_db)):
    """Get women's top 10 times for each race distance"""
    if year is not None and (year < 1900 or year > 2100):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid year")
    # Base query for female runners
    query = db.query(Results).filter(
        Results.gender_age.like('W%')  # Filter for female runners
    )

    # Add year filter if specified
    if year:
        query = query.filter(func.extract('year', Results.race_time) == year)

    # Get all results and group by distance
    all_results = query.all()

    # Group by distance and get top 10 for each
    distance_records = {}
    for result in all_results:
        if result.race_distance not in distance_records:
            distance_records[result.race_distance] = []
        distance_records[result.race_distance].append(result)

    # Sort each distance group by time and take top 10
    records = []
    for distance, results in distance_records.items():
        # Sort by overall_time (assuming format allows string comparison)
        sorted_results = sorted(results, key=lambda x: time_to_seconds(x.overall_time) if x.overall_time else float('inf'))[:10]

        for rank, result in enumerate(sorted_results, 1):
            records.append({
                "distance": distance,
                "rank": rank,
                "time": result.overall_time,
                "runner_name": result.name,
                "race_name": result.race,
                "race_date": result.race_time.strftime('%Y-%m-%d'),
                "age_group": result.gender_age,
                "pace": result.pace
            })

    return {"women_records": records}

@router.get("/all-races")
def get_all_races(db: Session = Depends(get_db)):
    """Get list of all races and distances"""
    races = db.query(
        Results.race,
        Results.race_distance,
        Results.race_time,
        func.count(Results.id).label('runner_count')
    ).group_by(
        Results.race, Results.race_distance, Results.race_time
    ).order_by(
        Results.race_time.desc()
    ).all()

    return {
        "races": [
            {
                "race_name": race.race,
                "distance": race.race_distance,
                "date": race.race_time.strftime('%Y-%m-%d'),
                "runner_count": race.runner_count
            } for race in races
        ]
    }


@router.get("/sync/races")
def get_sync_race_patterns():
    """Return the list of NYRR race patterns available for syncing."""
    from fetch_historical_data import RACE_PATTERNS

    patterns = []
    for code, info in RACE_PATTERNS.items():
        patterns.append({
            "code": code,
            "name_template": info["name_template"],
            "distance": info["distance"],
            "typical_month": info["typical_month"],
        })

    patterns.sort(key=lambda p: p["typical_month"])
    return {"races": patterns}


class NyrrSyncRequest(BaseModel):
    years: List[int]
    race_codes: Optional[List[str]] = None


@router.post("/sync")
async def sync_nyrr_data(request: Request):
    """
    Stream NYRR race data sync progress via SSE.
    Auth is validated manually since StreamingResponse doesn't work with Depends().
    """
    # Manual auth check
    firebase_uid = request.headers.get("X-Firebase-UID")
    if not firebase_uid:
        raise HTTPException(status_code=401, detail="Authentication required.")

    db = next(get_db())
    try:
        member = db.query(Member).filter(Member.firebase_uid == firebase_uid).first()
        if not member or member.status not in ('admin', 'committee'):
            raise HTTPException(status_code=403, detail="Committee or admin access required.")
    finally:
        db.close()

    # Parse request body
    body = await request.json()
    sync_req = NyrrSyncRequest(**body)

    from fetch_historical_data import (
        RACE_PATTERNS, generate_event_code, generate_race_config,
        fetch_race_data, import_race_data
    )

    # Determine which races to sync
    if sync_req.race_codes:
        race_items = [(code, RACE_PATTERNS[code]) for code in sync_req.race_codes if code in RACE_PATTERNS]
    else:
        race_items = list(RACE_PATTERNS.items())

    # Build list of (year, code, info) combos
    combos = []
    for year in sync_req.years:
        for code, info in race_items:
            combos.append((year, code, info))

    async def event_stream():
        yield f"data: {json.dumps({'type': 'start', 'total': len(combos)})}\n\n"

        total_imported = 0
        total_errors = 0

        for i, (year, code, info) in enumerate(combos):
            event_code = generate_event_code(code, year)
            config = generate_race_config(code, info, year)
            race_name = config["name"]

            # Send fetching status
            yield f"data: {json.dumps({'type': 'progress', 'index': i, 'race': race_name, 'status': 'fetching', 'event_code': event_code})}\n\n"

            try:
                df = await asyncio.to_thread(fetch_race_data, event_code)
                if df is not None and len(df) > 0:
                    count = await asyncio.to_thread(import_race_data, event_code, config, df)
                    total_imported += count
                    yield f"data: {json.dumps({'type': 'progress', 'index': i, 'race': race_name, 'status': 'imported', 'count': count})}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'progress', 'index': i, 'race': race_name, 'status': 'no_data', 'count': 0})}\n\n"
            except Exception as e:
                total_errors += 1
                yield f"data: {json.dumps({'type': 'progress', 'index': i, 'race': race_name, 'status': 'error', 'error': str(e)})}\n\n"

            # Delay between API calls
            await asyncio.sleep(0.5)

        yield f"data: {json.dumps({'type': 'complete', 'total_imported': total_imported, 'total_errors': total_errors})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/member/{search_key}")
def get_member_race_results(
    search_key: str,
    gender: str = None,
    birth_year: int = None,

    db: Session = Depends(get_db)
):
    """
    Get race results for a specific member by name.
    Returns all results matching the search key along with statistics.

    Uses exact matching on name + gender_age (calculated from birth_year)
    to accurately identify the runner's records.
    """
    # Search by exact name match (case-insensitive)
    results = db.query(Results).filter(
        Results.name.ilike(search_key)
    ).order_by(Results.race_time.desc()).all()

    # If gender and birth_year provided, filter by matching gender and calculated birth year
    # Map standard gender codes to NYRR codes (NYRR uses "M"/"W" instead of "M"/"F")
    gender_map = {"F": "W", "W": "W", "M": "M"}
    if gender and birth_year:
        if gender.upper() not in gender_map:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid gender '{gender}'. Must be M, F, or W"
            )
        mapped_gender = gender_map[gender.upper()]
        filtered_results = []
        for result in results:
            if result.race_time and result.gender_age:
                # Extract gender and age from result's gender_age (e.g., "M30" -> "M", 30)
                result_gender = result.gender_age[0] if result.gender_age else None
                try:
                    result_age = int(result.gender_age[1:]) if result.gender_age and len(result.gender_age) > 1 else None
                except ValueError:
                    result_age = None

                if result_gender and result_age:
                    # Calculate birth year from race year and age
                    race_year = result.race_time.year
                    calculated_birth_year = race_year - result_age

                    # Match if gender matches AND calculated birth year is exact or +1 year
                    # (+1 tolerance because if birthday hasn't passed yet, age is 1 less -> calc birth year is 1 more)
                    if result_gender == mapped_gender and calculated_birth_year in (birth_year, birth_year + 1):
                        filtered_results.append(result)
        results = filtered_results

    if not results:
        return {
            "results": [],
            "stats": {
                "total_races": 0,
                "prs": {},
                "recent_results": []
            }
        }

    # Calculate PRs by distance
    prs = {}
    for result in results:
        distance = result.race_distance
        if distance and result.overall_time:
            if distance not in prs or time_to_seconds(result.overall_time) < time_to_seconds(prs[distance]["time"]):
                prs[distance] = {
                    "time": result.overall_time,
                    "race": result.race,
                    "date": result.race_time.strftime('%Y-%m-%d') if result.race_time else None,
                    "pace": result.pace
                }

    # Format results
    formatted_results = [
        {
            "id": r.id,
            "race": r.race,
            "race_date": r.race_time.strftime('%Y-%m-%d') if r.race_time else None,
            "distance": r.race_distance,
            "overall_time": r.overall_time,
            "pace": r.pace,
            "overall_place": r.overall_place,
            "age_group_place": r.age_group_place,
            "gender_age": r.gender_age,
            "age_graded_time": r.age_graded_time,
            "age_graded_percent": float(r.age_graded_percent) if r.age_graded_percent else None
        }
        for r in results
    ]

    return {
        "results": formatted_results,
        "stats": {
            "total_races": len(results),
            "prs": prs,
            "recent_results": formatted_results[:5]
        }
    }
