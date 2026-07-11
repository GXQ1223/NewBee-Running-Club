"""Member race-record submissions and per-race photos.

Members report PRs from non-NYRR races (creating the race entry themselves,
with an official-results link and photo as proof). Committee reviews each
submission; on approval a matching row is inserted into `results` so the
record appears on the member's profile and the club Records leaderboard.
"""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db, Member, RacePhoto, RaceSubmission, Results
from models import (
    RacePhotoResponse,
    RacePhotoUpsert,
    RaceSubmissionCreate,
    RaceSubmissionPendingItem,
    RaceSubmissionResponse,
    RaceSubmissionReviewRequest,
    RaceSubmissionUpdate,
)
from utils.auth import get_current_committee_or_admin, get_current_member_required
from utils.time import time_to_seconds

router = APIRouter(prefix="/api/race-submissions", tags=["race-submissions"])
photos_router = APIRouter(prefix="/api/race-photos", tags=["race-photos"])

TIME_PATTERN = re.compile(r'^\d{1,2}:\d{2}(:\d{2})?$')


def distance_to_miles(distance: str):
    """Parse a race_distance string ("Marathon", "10K", "5M") to miles."""
    if not distance:
        return None
    d = distance.strip()
    lower = d.lower()
    if 'half' in lower and 'marathon' in lower:
        return 13.1094
    if 'marathon' in lower:
        return 26.2188
    match = re.match(r'^(\d+(?:\.\d+)?)\s*(k|km|m|mi|mile|miles)$', lower)
    if not match:
        return None
    value = float(match.group(1))
    unit = match.group(2)
    if unit in ('k', 'km'):
        return value / 1.60934
    return value


def compute_pace(finish_time: str, distance: str):
    """Per-mile pace "MM:SS" from finish time and distance; None if unknown."""
    miles = distance_to_miles(distance)
    if not miles:
        return None
    total_seconds = time_to_seconds(finish_time)
    if not total_seconds:
        return None
    pace_seconds = int(round(total_seconds / miles))
    return f"{pace_seconds // 60:02d}:{pace_seconds % 60:02d}"


def validate_finish_time(finish_time: str):
    if not TIME_PATTERN.match(finish_time.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid finish time. Use H:MM:SS or MM:SS format."
        )
    return finish_time.strip()


def member_result_name(member: Member) -> str:
    """The name a member's rows carry in the results table."""
    return member.display_name or member.nickname or member.username


@router.post("", response_model=RaceSubmissionResponse)
def create_race_submission(
    submission: RaceSubmissionCreate,
    db: Session = Depends(get_db),
    current_member: Member = Depends(get_current_member_required),
):
    """Submit a race record for committee review (member creates the race)."""
    finish_time = validate_finish_time(submission.finish_time)
    if submission.race_date > datetime.now(timezone.utc).date():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Race date cannot be in the future."
        )

    db_submission = RaceSubmission(
        member_id=current_member.id,
        race_name=submission.race_name.strip(),
        race_date=submission.race_date,
        race_distance=submission.race_distance.strip(),
        finish_time=finish_time,
        pace=compute_pace(finish_time, submission.race_distance),
        proof_url=submission.proof_url,
        photo_url=submission.photo_url,
        status='pending',
    )
    db.add(db_submission)
    db.commit()
    db.refresh(db_submission)
    return db_submission


@router.get("/mine", response_model=List[RaceSubmissionResponse])
def get_my_race_submissions(
    db: Session = Depends(get_db),
    current_member: Member = Depends(get_current_member_required),
):
    """All of the current member's submissions, newest first."""
    return db.query(RaceSubmission).filter(
        RaceSubmission.member_id == current_member.id
    ).order_by(RaceSubmission.created_at.desc(), RaceSubmission.id.desc()).all()


@router.get("/pending", response_model=List[RaceSubmissionPendingItem])
def get_pending_race_submissions(
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin),
):
    """Pending submissions with member info (committee or admin)."""
    rows = db.query(RaceSubmission, Member).join(
        Member, RaceSubmission.member_id == Member.id
    ).filter(
        RaceSubmission.status == 'pending'
    ).order_by(RaceSubmission.created_at.asc()).all()

    items = []
    for submission, member in rows:
        item = RaceSubmissionPendingItem.model_validate(submission)
        item.member_name = member_result_name(member)
        item.member_name_cn = member.display_name_cn
        item.member_gender = member.gender
        item.member_birth_year = member.birth_year
        items.append(item)
    return items


@router.put("/{submission_id}", response_model=RaceSubmissionResponse)
def update_race_submission(
    submission_id: int,
    update: RaceSubmissionUpdate,
    db: Session = Depends(get_db),
    current_member: Member = Depends(get_current_member_required),
):
    """Edit own submission. Photo may change anytime; other fields only while
    pending/rejected. Editing a rejected submission resubmits it for review."""
    submission = db.query(RaceSubmission).filter(RaceSubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    if submission.member_id != current_member.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own submissions."
        )

    changes = update.model_dump(exclude_unset=True)
    record_fields = {'race_name', 'race_date', 'race_distance', 'finish_time', 'proof_url'}
    changed_record_fields = record_fields & set(changes.keys())

    if changed_record_fields and submission.status == 'approved':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Approved records cannot be edited. Contact the committee."
        )

    if 'finish_time' in changes:
        changes['finish_time'] = validate_finish_time(changes['finish_time'])
    if 'race_date' in changes and changes['race_date'] > datetime.now(timezone.utc).date():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Race date cannot be in the future."
        )

    for field, value in changes.items():
        setattr(submission, field, value.strip() if isinstance(value, str) and field != 'photo_url' else value)

    submission.pace = compute_pace(submission.finish_time, submission.race_distance)

    # Editing the record itself resubmits a rejected submission for review
    if changed_record_fields and submission.status == 'rejected':
        submission.status = 'pending'
        submission.review_note = None
        submission.reviewed_by = None
        submission.reviewed_at = None

    db.commit()
    db.refresh(submission)
    return submission


@router.delete("/{submission_id}")
def delete_race_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_member: Member = Depends(get_current_member_required),
):
    """Withdraw own pending/rejected submission (committee may remove any
    non-approved one)."""
    submission = db.query(RaceSubmission).filter(RaceSubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    is_reviewer = current_member.status in ('admin', 'committee')
    if submission.member_id != current_member.id and not is_reviewer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only withdraw your own submissions."
        )
    if submission.status == 'approved':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Approved records cannot be withdrawn. Contact the committee."
        )

    db.delete(submission)
    db.commit()
    return {"message": f"Submission {submission_id} withdrawn"}


@router.put("/{submission_id}/review", response_model=RaceSubmissionResponse)
def review_race_submission(
    submission_id: int,
    review: RaceSubmissionReviewRequest,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin),
):
    """Approve or reject a submission (committee or admin). Approval posts the
    record to the results table → member profile + club leaderboard."""
    submission = db.query(RaceSubmission).filter(RaceSubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    if submission.status != 'pending':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Submission is already {submission.status}"
        )

    if review.approved:
        member = db.query(Member).filter(Member.id == submission.member_id).first()
        if not member:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submitting member not found")

        # gender_age (e.g. "M35") drives the men/women leaderboard queries;
        # NYRR uses W for women
        gender_age = None
        if member.gender and member.birth_year:
            nyrr_gender = 'W' if member.gender.upper() == 'F' else member.gender.upper()
            age = submission.race_date.year - member.birth_year
            gender_age = f"{nyrr_gender}{age}"

        result = Results(
            name=member_result_name(member),
            gender_age=gender_age,
            overall_time=submission.finish_time,
            pace=submission.pace,
            race=submission.race_name,
            race_time=datetime.combine(submission.race_date, datetime.min.time()),
            race_distance=submission.race_distance,
        )
        db.add(result)
        db.flush()
        submission.status = 'approved'
        submission.result_id = result.id
    else:
        if not review.review_note or not review.review_note.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A review note is required when rejecting."
            )
        submission.status = 'rejected'

    submission.review_note = review.review_note
    submission.reviewed_by = current_user.id
    submission.reviewed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(submission)
    return submission


@photos_router.put("", response_model=RacePhotoResponse)
def upsert_race_photo(
    photo: RacePhotoUpsert,
    db: Session = Depends(get_db),
    current_member: Member = Depends(get_current_member_required),
):
    """Attach or replace the member's own photo on one of their race results."""
    result = db.query(Results).filter(Results.id == photo.result_id).first()
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Race result not found")

    # The result must belong to the member (results are matched by name)
    own_names = {n.lower() for n in (
        current_member.display_name, current_member.nickname, current_member.username
    ) if n}
    if (result.name or '').lower() not in own_names:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only add photos to your own race results."
        )

    existing = db.query(RacePhoto).filter(
        RacePhoto.member_id == current_member.id,
        RacePhoto.result_id == photo.result_id,
    ).first()
    if existing:
        existing.photo_url = photo.photo_url
        db.commit()
        db.refresh(existing)
        return existing

    db_photo = RacePhoto(
        member_id=current_member.id,
        result_id=photo.result_id,
        photo_url=photo.photo_url,
    )
    db.add(db_photo)
    db.commit()
    db.refresh(db_photo)
    return db_photo


@photos_router.get("/mine", response_model=List[RacePhotoResponse])
def get_my_race_photos(
    db: Session = Depends(get_db),
    current_member: Member = Depends(get_current_member_required),
):
    """The current member's race photos, keyed by result_id."""
    return db.query(RacePhoto).filter(RacePhoto.member_id == current_member.id).all()
