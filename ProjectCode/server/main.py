from fastapi import FastAPI, Depends, HTTPException, status, Header, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel
import os
import uuid
import base64
from pathlib import Path
import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def must_have_env(env_var: str) -> str:
    """Get environment variable or raise error if not set."""
    value = os.getenv(env_var)
    if value is None:
        raise Exception(f"Environment variable '{env_var}' is not set")
    return value


# S3 Configuration (lazy-loaded to allow imports without env vars)
_s3_bucket = None
_s3_region = None
_s3_client = None


def get_s3_config():
    """Get S3 configuration, raising error if not configured."""
    global _s3_bucket, _s3_region
    if _s3_bucket is None:
        _s3_bucket = must_have_env('AWS_S3_BUCKET')
        _s3_region = must_have_env('AWS_REGION')
    return _s3_bucket, _s3_region


def get_s3_client():
    """Get or create S3 client with lazy initialization."""
    global _s3_client
    if _s3_client is None:
        aws_access_key = must_have_env('AWS_ACCESS_KEY_ID')
        aws_secret_key = must_have_env('AWS_SECRET_ACCESS_KEY')
        _, region = get_s3_config()
        _s3_client = boto3.client(
            's3',
            aws_access_key_id=aws_access_key,
            aws_secret_access_key=aws_secret_key,
            region_name=region
        )
    return _s3_client


def upload_to_s3(file_content: bytes, filename: str, event_id: int, content_type: str) -> str:
    """Upload file to S3 and return the public URL."""
    s3_client = get_s3_client()
    bucket, region = get_s3_config()

    # Generate unique key with event folder structure
    file_ext = filename.rsplit('.', 1)[-1] if '.' in filename else 'jpg'
    key = f"gallery/event-{event_id}/{uuid.uuid4().hex}.{file_ext}"

    s3_client.put_object(
        Bucket=bucket,
        Key=key,
        Body=file_content,
        ContentType=content_type
    )

    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"


def delete_from_s3(image_url: str) -> bool:
    """Delete file from S3 given its URL. Returns True if deleted, False if not an S3 URL."""
    bucket, _ = get_s3_config()

    if not image_url or 's3.' not in image_url or bucket not in image_url:
        return False  # Not an S3 URL (legacy base64 or other)

    s3_client = get_s3_client()

    try:
        # Extract key from URL: https://bucket.s3.region.amazonaws.com/key
        key = image_url.split('.amazonaws.com/')[-1]
        s3_client.delete_object(Bucket=bucket, Key=key)
        return True
    except ClientError as e:
        print(f"S3 delete error for {image_url}: {e}")
        return False

from database import get_db, create_tables, Donor, Results, Member, Event, MeetingMinutes, Comment, Like, Reaction, EventCommentSettings, TempClubCredit, BannerImage, TrainingTip, TrainingTipUpvote, HomepageSection, MemberActivity, EventGalleryImage, EventGalleryImageLike, EventRecurrenceRule, SiteSetting
from models import (
    DonorCreate, DonorUpdate, DonorResponse, DonorsListResponse, DonationSummary,
    DonorPublicResponse, DonorLinkMemberRequest,
    MemberCreate, MemberUpdate, MemberResponse, MemberPublicResponse, MemberStatus,
    FirebaseUserSync, JoinApplicationRequest, JoinApplicationWithActivities,
    MemberActivityCreate, MemberActivityUpdate, MemberActivityResponse, ActivityVerifyRequest, ActivityStatus,
    EventCreate, EventUpdate, EventResponse, EventStatus, EventType,
    MeetingMinutesCreate, MeetingMinutesUpdate, MeetingMinutesResponse,
    CommentCreate, CommentResponse, CommentWithModeration, CommentHideRequest,
    LikeCreate, LikeResponse, LikeCountResponse,
    ReactionCreate, ReactionCountResponse, EventReactionsResponse, ALLOWED_EMOJIS,
    EventCommentSettingsUpdate, EventCommentSettingsResponse,
    EventEngagementResponse, BatchEngagementRequest, BatchEngagementResponse,
    TempClubCreditCreate, TempClubCreditUpdate, TempClubCreditResponse, CreditType,
    BannerImageCreate, BannerImageUpdate, BannerImageResponse, CarouselBannerResponse,
    TrainingTipCreate, TrainingTipUpdate, TrainingTipResponse, TrainingTipPublicResponse, TrainingTipUpvoteResponse, TipStatus, TipCategory,
    HomepageSectionCreate, HomepageSectionUpdate, HomepageSectionResponse, SectionReorderRequest,
    EventGalleryImageCreate, EventGalleryImageUpdate, EventGalleryImageResponse, EventGalleryPreviewResponse, EventGalleryImageLikeResponse, BatchGalleryPreviewRequest, BatchGalleryPreviewResponse,
    EventRecurrenceRuleCreate, EventRecurrenceRuleUpdate, EventRecurrenceRuleResponse, RecurrenceType, EventWithRecurrence, EventCreateWithRecurrence,
    SiteSettingCreate, SiteSettingUpdate, SiteSettingResponse, SocialLinksResponse
)
from email_service import EmailService
import bcrypt

app = FastAPI(
    title="NewBee Running Club Donors API",
    description="API for managing donors - replacing CSV files with AWS MySQL database",
    version="1.0.0"
)

# CORS middleware for frontend connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://newbeerunningclub.org",
        "https://www.newbeerunningclub.org",
        "https://newbeerunning.org",
        "https://www.newbeerunning.org",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import scheduler for recurring events
from scheduler import start_scheduler, shutdown_scheduler

# Create database tables on startup and start scheduler
@app.on_event("startup")
def startup_event():
    create_tables()
    # Start the background scheduler for recurring events
    start_scheduler()


@app.on_event("shutdown")
def shutdown_event():
    # Gracefully shutdown the scheduler
    shutdown_scheduler()


# Authorization dependency for admin-only endpoints
def get_current_admin(
    x_firebase_uid: Optional[str] = Header(None, alias="X-Firebase-UID"),
    db: Session = Depends(get_db)
) -> Member:
    """
    Verify that the request is from an authenticated admin user.
    Requires X-Firebase-UID header with a valid admin's Firebase UID.
    """
    if not x_firebase_uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in."
        )

    member = db.query(Member).filter(Member.firebase_uid == x_firebase_uid).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication. User not found."
        )

    if member.status != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required. You do not have permission to perform this action."
        )

    return member


# Authorization dependency for committee or admin endpoints
def get_current_committee_or_admin(
    x_firebase_uid: Optional[str] = Header(None, alias="X-Firebase-UID"),
    db: Session = Depends(get_db)
) -> Member:
    """
    Verify that the request is from an authenticated committee member or admin.
    Committee members can do most admin tasks except manage other committee/admin members.
    """
    if not x_firebase_uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in."
        )

    member = db.query(Member).filter(Member.firebase_uid == x_firebase_uid).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication. User not found."
        )

    if member.status not in ['admin', 'committee']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Committee or admin access required. You do not have permission to perform this action."
        )

    return member


@app.get("/")
def read_root():
    return {"message": "NewBee Running Club API is running!", "database": "AWS MySQL RDS"}

# RACE RESULTS ENDPOINTS

@app.get("/api/results/available-years")
def get_available_years(db: Session = Depends(get_db)):
    """Get list of years that have race data"""
    years = db.query(
        func.extract('year', Results.race_time).label('year')
    ).distinct().order_by(
        func.extract('year', Results.race_time).desc()
    ).all()

    return {"years": [int(year.year) for year in years]}

@app.get("/api/results/men-records")
def get_men_records(year: int = None, db: Session = Depends(get_db)):
    """Get men's top 10 times for each race distance"""
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
        sorted_results = sorted(results, key=lambda x: x.overall_time or 'ZZ:ZZ:ZZ')[:10]

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

@app.get("/api/results/women-records")
def get_women_records(year: int = None, db: Session = Depends(get_db)):
    """Get women's top 10 times for each race distance"""
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
        sorted_results = sorted(results, key=lambda x: x.overall_time or 'ZZ:ZZ:ZZ')[:10]

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

@app.get("/api/results/all-races")
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


@app.get("/api/results/member/{search_key}")
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
    if gender and birth_year:
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
                    # (+1 tolerance because if birthday hasn't passed yet, age is 1 less → calc birth year is 1 more)
                    if result_gender == gender and calculated_birth_year in (birth_year, birth_year + 1):
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
            if distance not in prs or result.overall_time < prs[distance]["time"]:
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
            "gender_place": r.gender_place,
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


# Main endpoint for SponsorsPage - replaces CSV fetching
@app.get("/api/donors", response_model=DonorsListResponse)
def get_all_donors(db: Session = Depends(get_db)):
    """
    Get all donors separated by type for SponsorsPage
    Replaces: /data/individualDonors.csv and /data/enterpriseDonors.csv
    Sorted by donation_date (most recent first)
    """
    individual_donors = db.query(Donor).filter(
        Donor.donor_type == "individual",
        Donor.notes != "Anonymous Donor"  # Exclude anonymous donors as per original logic
    ).order_by(Donor.donation_date.desc(), Donor.name).all()

    enterprise_donors = db.query(Donor).filter(
        Donor.donor_type == "enterprise"
    ).order_by(Donor.donation_date.desc(), Donor.name).all()

    return DonorsListResponse(
        individual_donors=individual_donors,
        enterprise_donors=enterprise_donors
    )

@app.get("/api/donors/stats/summary", response_model=List[DonationSummary])
def get_donation_summary(db: Session = Depends(get_db)):
    """Get donation statistics by donor type for stakeholder reporting"""
    summary = db.query(
        Donor.donor_type,
        func.count(Donor.donation_id).label('donor_count'),
        func.sum(Donor.amount).label('total_amount'),
        func.avg(Donor.amount).label('average_amount'),
        func.min(Donor.amount).label('min_amount'),
        func.max(Donor.amount).label('max_amount')
    ).group_by(Donor.donor_type).all()

    return [
        DonationSummary(
            donor_type=row.donor_type,
            donor_count=row.donor_count,
            total_amount=row.total_amount,
            average_amount=row.average_amount,
            min_amount=row.min_amount,
            max_amount=row.max_amount
        ) for row in summary
    ]


@app.get("/api/donors/public", response_model=List[DonorPublicResponse])
def get_public_donors(db: Session = Depends(get_db)):
    """
    Get donors for public display with privacy rules applied:
    - Individual donors: hide amount, show date only
    - Enterprise donors: show amount
    - Respects linked member's show_in_donors setting
    - Excludes anonymous donors
    """
    # Get all non-anonymous donors
    donors = db.query(Donor).filter(
        Donor.notes != "Anonymous Donor"
    ).order_by(Donor.donation_date.desc(), Donor.name).all()

    public_donors = []
    for donor in donors:
        # Check if linked to a member who has opted out of donor display
        if donor.member_id:
            linked_member = db.query(Member).filter(Member.id == donor.member_id).first()
            if linked_member and not linked_member.show_in_donors:
                continue  # Skip this donor

        # Apply privacy rules: hide amount for individual donors
        show_amount = donor.donor_type == 'enterprise' and not donor.hide_amount

        public_donors.append(DonorPublicResponse(
            donation_id=donor.donation_id,
            donor_id=donor.donor_id,
            name=donor.name,
            donor_type=donor.donor_type,
            donation_event=donor.donation_event,
            amount=donor.amount if show_amount else None,
            quantity=donor.quantity,
            donation_date=donor.donation_date,
            message=donor.message
        ))

    return public_donors


@app.get("/api/donors/{donor_type}", response_model=List[DonorResponse])
def get_donors_by_type(donor_type: str, db: Session = Depends(get_db)):
    """Get donors by type (individual or enterprise), sorted by donation_date (most recent first)"""
    if donor_type not in ["individual", "enterprise"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Donor type must be 'individual' or 'enterprise'"
        )

    donors = db.query(Donor).filter(Donor.donor_type == donor_type).order_by(
        Donor.donation_date.desc(), Donor.name
    ).all()
    return donors

@app.post("/api/donors", response_model=DonorResponse)
def create_donor(donor: DonorCreate, db: Session = Depends(get_db)):
    """Create a new donor"""
    # Check if donor_id already exists
    existing = db.query(Donor).filter(Donor.donor_id == donor.donor_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Donor with ID {donor.donor_id} already exists"
        )
    
    db_donor = Donor(**donor.dict())
    db.add(db_donor)
    db.commit()
    db.refresh(db_donor)
    return db_donor

@app.get("/api/donors/id/{donor_id}", response_model=DonorResponse)
def get_donor_by_id(donor_id: str, db: Session = Depends(get_db)):
    """Get a specific donor by donor_id"""
    donor = db.query(Donor).filter(Donor.donor_id == donor_id).first()
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donor with ID {donor_id} not found"
        )
    return donor

@app.put("/api/donors/{donor_id}", response_model=DonorResponse)
def update_donor(donor_id: str, donor_update: DonorUpdate, db: Session = Depends(get_db)):
    """Update a donor"""
    donor = db.query(Donor).filter(Donor.donor_id == donor_id).first()
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donor with ID {donor_id} not found"
        )
    
    update_data = donor_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(donor, field, value)
    
    db.commit()
    db.refresh(donor)
    return donor

@app.delete("/api/donors/{donor_id}")
def delete_donor(donor_id: str, db: Session = Depends(get_db)):
    """Delete a donor"""
    donor = db.query(Donor).filter(Donor.donor_id == donor_id).first()
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donor with ID {donor_id} not found"
        )
    
    db.delete(donor)
    db.commit()
    return {"message": f"Donor {donor_id} deleted successfully"}


@app.put("/api/donors/{donor_id}/link-member")
def link_donor_to_member(
    donor_id: str,
    request: DonorLinkMemberRequest,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Link a donor record to a member account (admin only)"""
    donor = db.query(Donor).filter(Donor.donor_id == donor_id).first()
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donor with ID {donor_id} not found"
        )

    member = db.query(Member).filter(Member.id == request.member_id).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {request.member_id} not found"
        )

    donor.member_id = request.member_id
    db.commit()
    db.refresh(donor)

    return {
        "message": f"Donor {donor.name} linked to member {member.display_name or member.username}",
        "donor_id": donor_id,
        "member_id": request.member_id
    }


# MEMBER ENDPOINTS

@app.get("/api/members", response_model=List[MemberPublicResponse])
def get_all_members(db: Session = Depends(get_db)):
    """Get all active members (public info only) - excludes pending and quit members"""
    members = db.query(Member).filter(
        Member.status.in_(['runner', 'committee', 'admin'])
    ).order_by(Member.display_name).all()
    return members


@app.get("/api/members/credits", response_model=List[MemberPublicResponse])
def get_members_for_credits(db: Session = Depends(get_db)):
    """Get members who opted to show in credits page"""
    members = db.query(Member).filter(
        Member.show_in_credits == True,
        Member.status.in_(['runner', 'committee', 'admin'])
    ).order_by(
        (Member.registration_credits + Member.checkin_credits +
         Member.volunteer_credits + Member.activity_credits).desc()
    ).all()
    return members


@app.get("/api/members/{member_id}", response_model=MemberResponse)
def get_member(member_id: int, db: Session = Depends(get_db)):
    """Get a specific member by ID (full info for authenticated user)"""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {member_id} not found"
        )
    return member


@app.get("/api/members/username/{username}", response_model=MemberResponse)
def get_member_by_username(username: str, db: Session = Depends(get_db)):
    """Get a specific member by username"""
    member = db.query(Member).filter(Member.username == username).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with username {username} not found"
        )
    return member


@app.post("/api/members", response_model=MemberResponse)
def create_member(member: MemberCreate, db: Session = Depends(get_db)):
    """Create a new member"""
    # Check if username already exists
    existing_username = db.query(Member).filter(Member.username == member.username).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Username {member.username} already exists"
        )

    # Check if email already exists
    existing_email = db.query(Member).filter(Member.email == member.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email {member.email} already exists"
        )

    # Hash the password
    password_hash = bcrypt.hashpw(member.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    # Create member dict without password, add password_hash
    member_data = member.model_dump(exclude={'password'})
    member_data['password_hash'] = password_hash
    member_data['status'] = member_data['status'].value  # Convert enum to string

    db_member = Member(**member_data)
    db.add(db_member)
    db.commit()
    db.refresh(db_member)
    return db_member


@app.put("/api/members/{member_id}", response_model=MemberResponse)
def update_member(member_id: int, member_update: MemberUpdate, db: Session = Depends(get_db)):
    """Update a member"""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {member_id} not found"
        )

    update_data = member_update.model_dump(exclude_unset=True)

    # Convert enum to string if status is being updated
    if 'status' in update_data and update_data['status']:
        update_data['status'] = update_data['status'].value

    for field, value in update_data.items():
        setattr(member, field, value)

    db.commit()
    db.refresh(member)
    return member


@app.put("/api/members/{member_id}/privacy", response_model=MemberResponse)
def update_member_privacy(
    member_id: int,
    show_in_credits: bool = None,
    show_in_donors: bool = None,
    db: Session = Depends(get_db)
):
    """Update member privacy settings (for dashboard toggle)"""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {member_id} not found"
        )

    if show_in_credits is not None:
        member.show_in_credits = show_in_credits
    if show_in_donors is not None:
        member.show_in_donors = show_in_donors

    db.commit()
    db.refresh(member)
    return member


@app.delete("/api/members/{member_id}")
def delete_member(member_id: int, db: Session = Depends(get_db)):
    """Delete a member (admin only)"""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {member_id} not found"
        )

    db.delete(member)
    db.commit()
    return {"message": f"Member {member_id} deleted successfully"}


@app.get("/api/members/committee/list", response_model=List[MemberPublicResponse])
def get_committee_members(db: Session = Depends(get_db)):
    """Get all committee members (admin status indicates committee member)"""
    members = db.query(Member).filter(
        Member.status == 'admin'
    ).order_by(Member.display_name).all()
    return members


# Statuses that are blocked from logging in
BLOCKED_STATUSES = ['rejected', 'suspended', 'quit']


@app.post("/api/members/firebase-sync", response_model=MemberResponse)
def sync_firebase_user(user_data: FirebaseUserSync, db: Session = Depends(get_db)):
    """
    Sync a Firebase user to the members table.
    Creates a new member if not exists, returns existing member if already synced.
    Used after Firebase signup/login to ensure user exists in our database.
    """
    # Check if member already exists with this firebase_uid
    existing_member = db.query(Member).filter(Member.firebase_uid == user_data.firebase_uid).first()
    if existing_member:
        # Check if member is blocked from logging in
        if existing_member.status in BLOCKED_STATUSES:
            status_messages = {
                'rejected': 'Your application has been rejected. Please contact newbeerunningclub@gmail.com for more information.',
                'suspended': 'Your account has been suspended. Please contact newbeerunningclub@gmail.com for more information.',
                'quit': 'Your account is no longer active. Please contact newbeerunningclub@gmail.com if you wish to rejoin.'
            }
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=status_messages.get(existing_member.status, 'Account access denied')
            )
        # Update display name and photo if changed
        if user_data.display_name and user_data.display_name != existing_member.display_name:
            existing_member.display_name = user_data.display_name
        if user_data.photo_url and user_data.photo_url != existing_member.profile_photo_url:
            existing_member.profile_photo_url = user_data.photo_url
        db.commit()
        db.refresh(existing_member)
        return existing_member

    # Check if member exists with this email (might have been created before Firebase link)
    existing_email = db.query(Member).filter(Member.email == user_data.email).first()
    if existing_email:
        # Check if member is blocked from logging in
        if existing_email.status in BLOCKED_STATUSES:
            status_messages = {
                'rejected': 'Your application has been rejected. Please contact newbeerunningclub@gmail.com for more information.',
                'suspended': 'Your account has been suspended. Please contact newbeerunningclub@gmail.com for more information.',
                'quit': 'Your account is no longer active. Please contact newbeerunningclub@gmail.com if you wish to rejoin.'
            }
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=status_messages.get(existing_email.status, 'Account access denied')
            )
        # Link existing member to Firebase account
        existing_email.firebase_uid = user_data.firebase_uid
        if user_data.display_name:
            existing_email.display_name = user_data.display_name
        if user_data.photo_url:
            existing_email.profile_photo_url = user_data.photo_url
        db.commit()
        db.refresh(existing_email)
        return existing_email

    # Create new member
    # Generate username from email (part before @)
    username = user_data.email.split('@')[0]

    # Ensure username is unique
    base_username = username
    counter = 1
    while db.query(Member).filter(Member.username == username).first():
        username = f"{base_username}{counter}"
        counter += 1

    # Create member with placeholder password (Firebase handles auth)
    placeholder_hash = bcrypt.hashpw(b"firebase-auth-user", bcrypt.gensalt()).decode('utf-8')

    new_member = Member(
        username=username,
        email=user_data.email,
        password_hash=placeholder_hash,
        firebase_uid=user_data.firebase_uid,
        display_name=user_data.display_name,
        profile_photo_url=user_data.photo_url,
        status='pending'  # New signups default to pending status
    )

    db.add(new_member)
    db.commit()
    db.refresh(new_member)
    return new_member


@app.get("/api/members/firebase/{firebase_uid}", response_model=MemberResponse)
def get_member_by_firebase_uid(firebase_uid: str, db: Session = Depends(get_db)):
    """Get a member by their Firebase UID"""
    member = db.query(Member).filter(Member.firebase_uid == firebase_uid).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with Firebase UID not found"
        )
    # Check if member is blocked from logging in
    if member.status in BLOCKED_STATUSES:
        status_messages = {
            'rejected': 'Your application has been rejected. Please contact newbeerunningclub@gmail.com for more information.',
            'suspended': 'Your account has been suspended. Please contact newbeerunningclub@gmail.com for more information.',
            'quit': 'Your account is no longer active. Please contact newbeerunningclub@gmail.com if you wish to rejoin.'
        }
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=status_messages.get(member.status, 'Account access denied')
        )
    return member


@app.get("/api/members/pending/list", response_model=List[MemberResponse])
def get_pending_members(
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Get all pending member applications (for admin panel) - Committee or Admin"""
    members = db.query(Member).filter(
        Member.status == 'pending'
    ).order_by(Member.created_at.desc()).all()
    return members


@app.put("/api/members/{member_id}/approve")
def approve_member(
    member_id: int,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Approve a pending member application (changes status to runner and sends notification) - Committee or Admin"""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {member_id} not found"
        )

    if member.status != 'pending':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Member is not in pending status (current status: {member.status})"
        )

    member.status = 'runner'
    db.commit()
    db.refresh(member)

    # Send approval notification email
    try:
        EmailService.send_approval_notification(member.email, member.display_name or member.username)
    except Exception as e:
        print(f"Error sending approval email: {str(e)}")
        # Don't fail the request if email fails

    return {"message": f"Member {member.display_name or member.username} approved successfully", "member_id": member_id}


class RejectMemberRequest(BaseModel):
    rejection_reason: str


@app.put("/api/members/{member_id}/reject")
def reject_member(
    member_id: int,
    request: RejectMemberRequest,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Reject a pending member application - Committee or Admin"""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {member_id} not found"
        )

    if member.status != 'pending':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Member is not in pending status (current status: {member.status})"
        )

    if not request.rejection_reason or not request.rejection_reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rejection reason is required"
        )

    # Update status instead of deleting
    member.status = 'rejected'
    member.status_reason = request.rejection_reason.strip()
    member.status_updated_at = datetime.utcnow()
    member.status_updated_by = current_user.display_name or current_user.username
    db.commit()

    # Send rejection email
    try:
        EmailService.send_rejection_notification(
            member.email,
            member.display_name or member.username,
            request.rejection_reason.strip()
        )
    except Exception as e:
        # Log error but don't fail the rejection
        print(f"Failed to send rejection email: {e}")

    return {"message": f"Member application rejected", "member_id": member_id}


@app.post("/api/join/submit")
def submit_join_application(application: JoinApplicationRequest, db: Session = Depends(get_db)):
    """
    Submit a new member join application
    Sends confirmation email to applicant and notification to committee
    """
    # Check if email already exists
    existing_member = db.query(Member).filter(Member.email == application.email).first()
    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists. Please log in or use a different email."
        )

    # Generate username from first and last name
    full_name = f"{application.first_name} {application.last_name}"
    username = f"{application.first_name}{application.last_name}".lower().replace(" ", "")
    base_username = username
    counter = 1
    while db.query(Member).filter(Member.username == username).first():
        username = f"{base_username}{counter}"
        counter += 1

    # Create member with pending status
    placeholder_hash = bcrypt.hashpw(b"pending-application", bcrypt.gensalt()).decode('utf-8')

    new_member = Member(
        username=username,
        email=application.email,
        password_hash=placeholder_hash,
        first_name=application.first_name,
        last_name=application.last_name,
        display_name=full_name,
        nyrr_member_id=application.nyrr_id,
        status='pending',
        # Application form data
        running_experience=application.running_experience,
        running_location=application.location,
        weekly_frequency=application.weekly_frequency,
        monthly_mileage=application.monthly_mileage,
        race_experience=application.race_experience,
        running_goals=application.goals,
        introduction=application.introduction
    )

    db.add(new_member)
    db.commit()
    db.refresh(new_member)

    # Prepare form data for committee notification
    form_data = {
        "Running Experience": application.running_experience,
        "Location": application.location,
        "Weekly Frequency": application.weekly_frequency,
        "Monthly Mileage": application.monthly_mileage,
        "Race Experience": application.race_experience or "No races yet",
        "Goals": application.goals,
        "Introduction": application.introduction
    }

    # Send emails
    try:
        # Send confirmation to applicant
        EmailService.send_join_confirmation(application.email, full_name)

        # Send notification to committee
        EmailService.send_committee_notification(
            full_name,
            application.email,
            application.nyrr_id,
            form_data
        )
    except Exception as e:
        print(f"Error sending emails: {str(e)}")
        # Don't fail the request if email fails, just log it

    return {
        "message": "Application submitted successfully! You will receive a confirmation email shortly.",
        "member_id": new_member.id,
        "status": "pending"
    }


# COMMITTEE ROLE MANAGEMENT ENDPOINTS (Admin only)

@app.put("/api/members/{member_id}/promote-to-committee")
def promote_to_committee(
    member_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Promote a runner to committee status (admin only)"""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {member_id} not found"
        )

    if member.status not in ['runner', 'pending']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Can only promote runners or pending members to committee (current status: {member.status})"
        )

    member.status = 'committee'
    db.commit()
    db.refresh(member)
    return {
        "message": f"Member {member.display_name or member.username} promoted to committee",
        "member_id": member_id,
        "new_status": "committee"
    }


@app.put("/api/members/{member_id}/demote-from-committee")
def demote_from_committee(
    member_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Demote a committee member back to runner status (admin only)"""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {member_id} not found"
        )

    if member.status != 'committee':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Member is not a committee member (current status: {member.status})"
        )

    member.status = 'runner'
    db.commit()
    db.refresh(member)
    return {
        "message": f"Member {member.display_name or member.username} demoted to runner",
        "member_id": member_id,
        "new_status": "runner"
    }


@app.get("/api/members/committee/all", response_model=List[MemberPublicResponse])
def get_all_committee_and_admins(db: Session = Depends(get_db)):
    """Get all committee members and admins"""
    members = db.query(Member).filter(
        Member.status.in_(['admin', 'committee'])
    ).order_by(Member.status.desc(), Member.display_name).all()
    return members


# MEMBER ACTIVITY ENDPOINTS (for two offline activities requirement)

@app.get("/api/members/{member_id}/activities", response_model=List[MemberActivityResponse])
def get_member_activities(
    member_id: int,
    db: Session = Depends(get_db)
):
    """Get a member's offline activity records"""
    activities = db.query(MemberActivity).filter(
        MemberActivity.member_id == member_id
    ).order_by(MemberActivity.activity_number).all()
    return activities


@app.post("/api/members/{member_id}/activities", response_model=MemberActivityResponse)
def submit_member_activity(
    member_id: int,
    activity: MemberActivityCreate,
    db: Session = Depends(get_db)
):
    """Submit an offline activity record (part of join process)"""
    # Verify member exists
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {member_id} not found"
        )

    # Check if activity_number is already submitted
    existing = db.query(MemberActivity).filter(
        MemberActivity.member_id == member_id,
        MemberActivity.activity_number == activity.activity_number
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Activity {activity.activity_number} already submitted for this member"
        )

    # Create the activity record
    activity_data = activity.model_dump()
    activity_data['member_id'] = member_id
    activity_data['status'] = 'pending'

    db_activity = MemberActivity(**activity_data)
    db.add(db_activity)

    # Update member's activities_completed count
    member.activities_completed = db.query(MemberActivity).filter(
        MemberActivity.member_id == member_id
    ).count() + 1

    db.commit()
    db.refresh(db_activity)
    return db_activity


@app.put("/api/activities/{activity_id}/verify")
def verify_activity(
    activity_id: int,
    request: ActivityVerifyRequest,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Verify or reject a member activity (committee or admin)"""
    activity = db.query(MemberActivity).filter(MemberActivity.id == activity_id).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Activity with ID {activity_id} not found"
        )

    if activity.status != 'pending':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Activity is already {activity.status}"
        )

    if request.approved:
        activity.status = 'verified'
    else:
        activity.status = 'rejected'
        activity.rejection_reason = request.rejection_reason

    activity.verified_by = current_user.id
    activity.verified_at = func.now()

    db.commit()
    db.refresh(activity)

    return {
        "message": f"Activity {'verified' if request.approved else 'rejected'}",
        "activity_id": activity_id,
        "status": activity.status
    }


@app.get("/api/activities/pending", response_model=List[MemberActivityResponse])
def get_pending_activities(
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Get all pending activities awaiting verification (committee or admin)"""
    activities = db.query(MemberActivity).filter(
        MemberActivity.status == 'pending'
    ).order_by(MemberActivity.created_at.desc()).all()
    return activities


@app.delete("/api/activities/{activity_id}")
def delete_activity(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Delete an activity record (committee or admin)"""
    activity = db.query(MemberActivity).filter(MemberActivity.id == activity_id).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Activity with ID {activity_id} not found"
        )

    member_id = activity.member_id
    db.delete(activity)

    # Update member's activities_completed count
    member = db.query(Member).filter(Member.id == member_id).first()
    if member:
        member.activities_completed = db.query(MemberActivity).filter(
            MemberActivity.member_id == member_id
        ).count()

    db.commit()
    return {"message": f"Activity {activity_id} deleted successfully"}


# EVENT ENDPOINTS

@app.get("/api/events", response_model=List[EventResponse])
def get_all_events(
    event_status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get all events, optionally filtered by status.
    Status can be: 'Upcoming', 'Highlight', 'Cancelled'
    """
    query = db.query(Event)
    if event_status:
        query = query.filter(Event.status == event_status)
    events = query.order_by(Event.date.desc()).all()
    return events


@app.get("/api/events/status/{event_status}", response_model=List[EventResponse])
def get_events_by_status(event_status: str, db: Session = Depends(get_db)):
    """Get events filtered by status (Upcoming, Highlight, Cancelled)"""
    events = db.query(Event).filter(
        Event.status == event_status
    ).order_by(Event.date.desc()).all()
    return events


@app.get("/api/events/{event_id}", response_model=EventResponse)
def get_event(event_id: int, db: Session = Depends(get_db)):
    """Get a specific event by ID"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event with ID {event_id} not found"
        )
    return event


@app.post("/api/events", response_model=EventResponse)
def create_event(
    event: EventCreate,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Create a new event (committee or admin)"""
    event_data = event.model_dump()
    # Convert enum to string value
    if 'status' in event_data and event_data['status']:
        event_data['status'] = event_data['status'].value
    if 'event_type' in event_data and event_data['event_type']:
        event_data['event_type'] = event_data['event_type'].value

    db_event = Event(**event_data)
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event


@app.put("/api/events/{event_id}", response_model=EventResponse)
def update_event(
    event_id: int,
    event_update: EventUpdate,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Update an event (committee or admin)"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event with ID {event_id} not found"
        )

    update_data = event_update.model_dump(exclude_unset=True)

    # Convert enum to string if status is being updated
    if 'status' in update_data and update_data['status']:
        update_data['status'] = update_data['status'].value
    if 'event_type' in update_data and update_data['event_type']:
        update_data['event_type'] = update_data['event_type'].value

    for field, value in update_data.items():
        setattr(event, field, value)

    db.commit()
    db.refresh(event)
    return event


@app.delete("/api/events/{event_id}")
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Delete an event (committee or admin)"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event with ID {event_id} not found"
        )

    db.delete(event)
    db.commit()
    return {"message": f"Event {event_id} deleted successfully"}


# MEETING MINUTES ENDPOINTS

@app.get("/api/meeting-minutes", response_model=List[MeetingMinutesResponse])
def get_all_meeting_minutes(db: Session = Depends(get_db)):
    """Get all meeting minutes, sorted by meeting date (most recent first)"""
    minutes = db.query(MeetingMinutes).order_by(MeetingMinutes.meeting_date.desc()).all()
    return minutes


@app.get("/api/meeting-minutes/{minutes_id}", response_model=MeetingMinutesResponse)
def get_meeting_minutes(minutes_id: int, db: Session = Depends(get_db)):
    """Get a specific meeting minutes by ID"""
    minutes = db.query(MeetingMinutes).filter(MeetingMinutes.id == minutes_id).first()
    if not minutes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting minutes with ID {minutes_id} not found"
        )
    return minutes


@app.post("/api/meeting-minutes", response_model=MeetingMinutesResponse)
def create_meeting_minutes(
    minutes: MeetingMinutesCreate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Create new meeting minutes (admin only)"""
    minutes_data = minutes.model_dump()
    minutes_data['created_by'] = current_admin.display_name or current_admin.username
    minutes_data['created_by_id'] = current_admin.id

    db_minutes = MeetingMinutes(**minutes_data)
    db.add(db_minutes)
    db.commit()
    db.refresh(db_minutes)
    return db_minutes


@app.put("/api/meeting-minutes/{minutes_id}", response_model=MeetingMinutesResponse)
def update_meeting_minutes(
    minutes_id: int,
    minutes_update: MeetingMinutesUpdate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Update meeting minutes (admin only)"""
    minutes = db.query(MeetingMinutes).filter(MeetingMinutes.id == minutes_id).first()
    if not minutes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting minutes with ID {minutes_id} not found"
        )

    update_data = minutes_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(minutes, field, value)

    db.commit()
    db.refresh(minutes)
    return minutes


@app.delete("/api/meeting-minutes/{minutes_id}")
def delete_meeting_minutes(
    minutes_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Delete meeting minutes (admin only)"""
    minutes = db.query(MeetingMinutes).filter(MeetingMinutes.id == minutes_id).first()
    if not minutes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting minutes with ID {minutes_id} not found"
        )

    db.delete(minutes)
    db.commit()
    return {"message": f"Meeting minutes {minutes_id} deleted successfully"}


# ENGAGEMENT ENDPOINTS (Comments, Likes, Reactions)

# Helper function for optional member authentication
def get_current_member_optional(
    x_firebase_uid: Optional[str] = Header(None, alias="X-Firebase-UID"),
    db: Session = Depends(get_db)
) -> Optional[Member]:
    """
    Get current member if authenticated, otherwise return None.
    Used for endpoints that allow both logged-in and anonymous users.
    """
    if not x_firebase_uid:
        return None
    return db.query(Member).filter(Member.firebase_uid == x_firebase_uid).first()


def get_current_member_required(
    x_firebase_uid: Optional[str] = Header(None, alias="X-Firebase-UID"),
    db: Session = Depends(get_db)
) -> Member:
    """
    Require authenticated member.
    Used for endpoints that require login (e.g., posting comments).
    """
    if not x_firebase_uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="You must be logged in to perform this action."
        )
    member = db.query(Member).filter(Member.firebase_uid == x_firebase_uid).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found. Please log in again."
        )
    return member


def get_or_create_event_settings(event_id: int, db: Session) -> EventCommentSettings:
    """Get or create event comment settings"""
    settings = db.query(EventCommentSettings).filter(EventCommentSettings.event_id == event_id).first()
    if not settings:
        settings = EventCommentSettings(event_id=event_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


# COMMENT ENDPOINTS

@app.get("/api/events/{event_id}/comments", response_model=List[CommentResponse])
def get_event_comments(event_id: int, db: Session = Depends(get_db)):
    """Get visible (non-hidden) comments for an event"""
    # Verify event exists
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    comments = db.query(Comment).filter(
        Comment.event_id == event_id,
        Comment.is_hidden == False
    ).order_by(
        Comment.is_highlighted.desc(),  # Highlighted comments first
        Comment.created_at.desc()
    ).all()
    return comments


@app.get("/api/events/{event_id}/comments/all", response_model=List[CommentWithModeration])
def get_all_event_comments(
    event_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Get all comments including hidden ones (admin only)"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    comments = db.query(Comment).filter(
        Comment.event_id == event_id
    ).order_by(
        Comment.is_highlighted.desc(),
        Comment.created_at.desc()
    ).all()
    return comments


@app.post("/api/events/{event_id}/comments", response_model=CommentResponse)
def create_comment(
    event_id: int,
    comment_data: CommentCreate,
    db: Session = Depends(get_db),
    current_member: Member = Depends(get_current_member_required)
):
    """Create a new comment (logged-in members only)"""
    # Verify event exists
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Check if comments are enabled
    settings = get_or_create_event_settings(event_id, db)
    if not settings.comments_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Comments are disabled for this event"
        )

    comment = Comment(
        event_id=event_id,
        member_id=current_member.id,
        firebase_uid=current_member.firebase_uid,
        content=comment_data.content,
        author_name=current_member.display_name or current_member.username,
        author_photo_url=current_member.profile_photo_url
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@app.delete("/api/comments/{comment_id}")
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_member: Member = Depends(get_current_member_required)
):
    """Delete own comment"""
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    # Check ownership or admin
    if comment.member_id != current_member.id and current_member.status != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comments"
        )

    db.delete(comment)
    db.commit()
    return {"message": "Comment deleted successfully"}


@app.put("/api/comments/{comment_id}/highlight")
def toggle_comment_highlight(
    comment_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Toggle highlight status of a comment (admin only)"""
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    comment.is_highlighted = not comment.is_highlighted
    db.commit()
    return {"message": f"Comment {'highlighted' if comment.is_highlighted else 'unhighlighted'}", "is_highlighted": comment.is_highlighted}


@app.put("/api/comments/{comment_id}/hide")
def hide_comment(
    comment_id: int,
    hide_request: CommentHideRequest,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Hide a comment with reason (admin only)"""
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    comment.is_hidden = True
    comment.hidden_by = current_admin.id
    comment.hidden_at = func.now()
    comment.hidden_reason = hide_request.reason
    db.commit()
    return {"message": "Comment hidden successfully"}


@app.put("/api/comments/{comment_id}/unhide")
def unhide_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Unhide a comment (admin only)"""
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    comment.is_hidden = False
    comment.hidden_by = None
    comment.hidden_at = None
    comment.hidden_reason = None
    db.commit()
    return {"message": "Comment unhidden successfully"}


# LIKE ENDPOINTS

@app.get("/api/events/{event_id}/likes", response_model=LikeCountResponse)
def get_event_likes(
    event_id: int,
    anonymous_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_member: Optional[Member] = Depends(get_current_member_optional)
):
    """Get like count and whether current user has liked"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    count = db.query(Like).filter(Like.event_id == event_id).count()

    # Check if user has liked
    user_liked = False
    if current_member:
        user_liked = db.query(Like).filter(
            Like.event_id == event_id,
            Like.member_id == current_member.id
        ).first() is not None
    elif anonymous_id:
        user_liked = db.query(Like).filter(
            Like.event_id == event_id,
            Like.anonymous_id == anonymous_id
        ).first() is not None

    return LikeCountResponse(count=count, user_liked=user_liked)


@app.post("/api/events/{event_id}/likes", response_model=LikeCountResponse)
def toggle_like(
    event_id: int,
    like_data: LikeCreate,
    db: Session = Depends(get_db),
    current_member: Optional[Member] = Depends(get_current_member_optional)
):
    """Toggle like on an event (works for both logged-in and anonymous users)"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Check if likes are enabled
    settings = get_or_create_event_settings(event_id, db)
    if not settings.likes_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Likes are disabled for this event"
        )

    existing_like = None
    if current_member:
        existing_like = db.query(Like).filter(
            Like.event_id == event_id,
            Like.member_id == current_member.id
        ).first()
    elif like_data.anonymous_id:
        existing_like = db.query(Like).filter(
            Like.event_id == event_id,
            Like.anonymous_id == like_data.anonymous_id
        ).first()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Anonymous ID required for non-logged-in users"
        )

    if existing_like:
        # Unlike
        db.delete(existing_like)
        db.commit()
        user_liked = False
    else:
        # Like
        new_like = Like(
            event_id=event_id,
            member_id=current_member.id if current_member else None,
            firebase_uid=current_member.firebase_uid if current_member else None,
            anonymous_id=like_data.anonymous_id if not current_member else None
        )
        db.add(new_like)
        db.commit()
        user_liked = True

    count = db.query(Like).filter(Like.event_id == event_id).count()
    return LikeCountResponse(count=count, user_liked=user_liked)


@app.delete("/api/events/{event_id}/likes")
def remove_like(
    event_id: int,
    anonymous_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_member: Optional[Member] = Depends(get_current_member_optional)
):
    """Remove like from an event"""
    existing_like = None
    if current_member:
        existing_like = db.query(Like).filter(
            Like.event_id == event_id,
            Like.member_id == current_member.id
        ).first()
    elif anonymous_id:
        existing_like = db.query(Like).filter(
            Like.event_id == event_id,
            Like.anonymous_id == anonymous_id
        ).first()

    if existing_like:
        db.delete(existing_like)
        db.commit()
        return {"message": "Like removed"}
    return {"message": "Like not found"}


# REACTION ENDPOINTS

@app.get("/api/events/{event_id}/reactions", response_model=EventReactionsResponse)
def get_event_reactions(
    event_id: int,
    anonymous_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_member: Optional[Member] = Depends(get_current_member_optional)
):
    """Get reaction counts for an event"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Get counts per emoji
    reaction_counts = db.query(
        Reaction.emoji,
        func.count(Reaction.id).label('count')
    ).filter(Reaction.event_id == event_id).group_by(Reaction.emoji).all()

    # Get user's reactions
    user_reactions = set()
    if current_member:
        user_reaction_list = db.query(Reaction.emoji).filter(
            Reaction.event_id == event_id,
            Reaction.member_id == current_member.id
        ).all()
        user_reactions = {r.emoji for r in user_reaction_list}
    elif anonymous_id:
        user_reaction_list = db.query(Reaction.emoji).filter(
            Reaction.event_id == event_id,
            Reaction.anonymous_id == anonymous_id
        ).all()
        user_reactions = {r.emoji for r in user_reaction_list}

    reactions = [
        ReactionCountResponse(
            emoji=emoji,
            count=count,
            user_reacted=emoji in user_reactions
        )
        for emoji, count in reaction_counts
    ]

    return EventReactionsResponse(reactions=reactions)


@app.post("/api/events/{event_id}/reactions", response_model=EventReactionsResponse)
def toggle_reaction(
    event_id: int,
    reaction_data: ReactionCreate,
    db: Session = Depends(get_db),
    current_member: Optional[Member] = Depends(get_current_member_optional)
):
    """Add or remove a reaction"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Validate emoji
    if reaction_data.emoji not in ALLOWED_EMOJIS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid emoji. Allowed: {', '.join(ALLOWED_EMOJIS)}"
        )

    # Check if reactions are enabled
    settings = get_or_create_event_settings(event_id, db)
    if not settings.reactions_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Reactions are disabled for this event"
        )

    existing_reaction = None
    if current_member:
        existing_reaction = db.query(Reaction).filter(
            Reaction.event_id == event_id,
            Reaction.member_id == current_member.id,
            Reaction.emoji == reaction_data.emoji
        ).first()
    elif reaction_data.anonymous_id:
        existing_reaction = db.query(Reaction).filter(
            Reaction.event_id == event_id,
            Reaction.anonymous_id == reaction_data.anonymous_id,
            Reaction.emoji == reaction_data.emoji
        ).first()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Anonymous ID required for non-logged-in users"
        )

    if existing_reaction:
        # Remove reaction
        db.delete(existing_reaction)
        db.commit()
    else:
        # Add reaction
        new_reaction = Reaction(
            event_id=event_id,
            member_id=current_member.id if current_member else None,
            firebase_uid=current_member.firebase_uid if current_member else None,
            anonymous_id=reaction_data.anonymous_id if not current_member else None,
            emoji=reaction_data.emoji
        )
        db.add(new_reaction)
        db.commit()

    # Return updated reactions
    return get_event_reactions(event_id, reaction_data.anonymous_id, db, current_member)


@app.delete("/api/events/{event_id}/reactions/{emoji}")
def remove_reaction(
    event_id: int,
    emoji: str,
    anonymous_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_member: Optional[Member] = Depends(get_current_member_optional)
):
    """Remove a specific reaction"""
    existing_reaction = None
    if current_member:
        existing_reaction = db.query(Reaction).filter(
            Reaction.event_id == event_id,
            Reaction.member_id == current_member.id,
            Reaction.emoji == emoji
        ).first()
    elif anonymous_id:
        existing_reaction = db.query(Reaction).filter(
            Reaction.event_id == event_id,
            Reaction.anonymous_id == anonymous_id,
            Reaction.emoji == emoji
        ).first()

    if existing_reaction:
        db.delete(existing_reaction)
        db.commit()
        return {"message": "Reaction removed"}
    return {"message": "Reaction not found"}


# AGGREGATED ENGAGEMENT ENDPOINTS

@app.get("/api/events/{event_id}/engagement", response_model=EventEngagementResponse)
def get_event_engagement(
    event_id: int,
    anonymous_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_member: Optional[Member] = Depends(get_current_member_optional)
):
    """Get all engagement data for an event"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Get settings
    settings = get_or_create_event_settings(event_id, db)

    # Get likes
    like_count = db.query(Like).filter(Like.event_id == event_id).count()
    user_liked = False
    if current_member:
        user_liked = db.query(Like).filter(
            Like.event_id == event_id,
            Like.member_id == current_member.id
        ).first() is not None
    elif anonymous_id:
        user_liked = db.query(Like).filter(
            Like.event_id == event_id,
            Like.anonymous_id == anonymous_id
        ).first() is not None

    # Get reactions
    reaction_counts = db.query(
        Reaction.emoji,
        func.count(Reaction.id).label('count')
    ).filter(Reaction.event_id == event_id).group_by(Reaction.emoji).all()

    user_reactions = set()
    if current_member:
        user_reaction_list = db.query(Reaction.emoji).filter(
            Reaction.event_id == event_id,
            Reaction.member_id == current_member.id
        ).all()
        user_reactions = {r.emoji for r in user_reaction_list}
    elif anonymous_id:
        user_reaction_list = db.query(Reaction.emoji).filter(
            Reaction.event_id == event_id,
            Reaction.anonymous_id == anonymous_id
        ).all()
        user_reactions = {r.emoji for r in user_reaction_list}

    reactions = [
        ReactionCountResponse(emoji=emoji, count=count, user_reacted=emoji in user_reactions)
        for emoji, count in reaction_counts
    ]

    # Get comment count
    comment_count = db.query(Comment).filter(
        Comment.event_id == event_id,
        Comment.is_hidden == False
    ).count()

    return EventEngagementResponse(
        event_id=event_id,
        likes=LikeCountResponse(count=like_count, user_liked=user_liked),
        reactions=reactions,
        comment_count=comment_count,
        comments_enabled=settings.comments_enabled,
        likes_enabled=settings.likes_enabled,
        reactions_enabled=settings.reactions_enabled
    )


@app.post("/api/events/engagement/batch", response_model=BatchEngagementResponse)
def get_batch_engagement(
    request: BatchEngagementRequest,
    db: Session = Depends(get_db),
    current_member: Optional[Member] = Depends(get_current_member_optional)
):
    """Get engagement data for multiple events (for list views)"""
    engagements = {}
    for event_id in request.event_ids:
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            continue

        settings = get_or_create_event_settings(event_id, db)

        # Get likes
        like_count = db.query(Like).filter(Like.event_id == event_id).count()
        user_liked = False
        if current_member:
            user_liked = db.query(Like).filter(
                Like.event_id == event_id,
                Like.member_id == current_member.id
            ).first() is not None
        elif request.anonymous_id:
            user_liked = db.query(Like).filter(
                Like.event_id == event_id,
                Like.anonymous_id == request.anonymous_id
            ).first() is not None

        # Get reactions
        reaction_counts = db.query(
            Reaction.emoji,
            func.count(Reaction.id).label('count')
        ).filter(Reaction.event_id == event_id).group_by(Reaction.emoji).all()

        user_reactions = set()
        if current_member:
            user_reaction_list = db.query(Reaction.emoji).filter(
                Reaction.event_id == event_id,
                Reaction.member_id == current_member.id
            ).all()
            user_reactions = {r.emoji for r in user_reaction_list}
        elif request.anonymous_id:
            user_reaction_list = db.query(Reaction.emoji).filter(
                Reaction.event_id == event_id,
                Reaction.anonymous_id == request.anonymous_id
            ).all()
            user_reactions = {r.emoji for r in user_reaction_list}

        reactions = [
            ReactionCountResponse(emoji=emoji, count=count, user_reacted=emoji in user_reactions)
            for emoji, count in reaction_counts
        ]

        # Get comment count
        comment_count = db.query(Comment).filter(
            Comment.event_id == event_id,
            Comment.is_hidden == False
        ).count()

        engagements[event_id] = EventEngagementResponse(
            event_id=event_id,
            likes=LikeCountResponse(count=like_count, user_liked=user_liked),
            reactions=reactions,
            comment_count=comment_count,
            comments_enabled=settings.comments_enabled,
            likes_enabled=settings.likes_enabled,
            reactions_enabled=settings.reactions_enabled
        )

    return BatchEngagementResponse(engagements=engagements)


# EVENT SETTINGS ENDPOINTS (Admin)

@app.get("/api/events/{event_id}/settings", response_model=EventCommentSettingsResponse)
def get_event_settings(event_id: int, db: Session = Depends(get_db)):
    """Get event engagement settings"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    settings = get_or_create_event_settings(event_id, db)
    return settings


@app.put("/api/events/{event_id}/settings", response_model=EventCommentSettingsResponse)
def update_event_settings(
    event_id: int,
    settings_update: EventCommentSettingsUpdate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Update event engagement settings (admin only)"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    settings = get_or_create_event_settings(event_id, db)

    update_data = settings_update.model_dump(exclude_unset=True)

    # Track if any feature was disabled
    feature_disabled = False
    for field, value in update_data.items():
        if field in ['comments_enabled', 'likes_enabled', 'reactions_enabled'] and value is False:
            feature_disabled = True
        setattr(settings, field, value)

    # Set closed info if a feature was disabled
    if feature_disabled:
        settings.closed_at = func.now()
        settings.closed_by = current_admin.id

    db.commit()
    db.refresh(settings)
    return settings


# TEMP CLUB CREDITS ENDPOINTS

@app.get("/api/credits", response_model=List[TempClubCreditResponse])
def get_all_credits(
    credit_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get all temp club credits, optionally filtered by credit type.
    Credit types: 'total', 'activity', 'registration', 'volunteer'
    """
    query = db.query(TempClubCredit)
    if credit_type:
        if credit_type not in ['total', 'activity', 'registration', 'volunteer']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Credit type must be 'total', 'activity', 'registration', or 'volunteer'"
            )
        query = query.filter(TempClubCredit.credit_type == credit_type)

    # Sort by total credits descending (registration + checkin)
    credits = query.order_by(
        (TempClubCredit.registration_credits + TempClubCredit.checkin_credits).desc(),
        TempClubCredit.full_name
    ).all()
    return credits


@app.get("/api/credits/{credit_id}", response_model=TempClubCreditResponse)
def get_credit_by_id(credit_id: int, db: Session = Depends(get_db)):
    """Get a specific credit entry by ID"""
    credit = db.query(TempClubCredit).filter(TempClubCredit.id == credit_id).first()
    if not credit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Credit with ID {credit_id} not found"
        )
    return credit


@app.post("/api/credits", response_model=TempClubCreditResponse)
def create_credit(
    credit: TempClubCreditCreate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Create a new credit entry (admin only)"""
    credit_data = credit.model_dump()
    # Convert enum to string value
    if 'credit_type' in credit_data and credit_data['credit_type']:
        credit_data['credit_type'] = credit_data['credit_type'].value

    db_credit = TempClubCredit(**credit_data)
    db.add(db_credit)
    db.commit()
    db.refresh(db_credit)
    return db_credit


@app.put("/api/credits/{credit_id}", response_model=TempClubCreditResponse)
def update_credit(
    credit_id: int,
    credit_update: TempClubCreditUpdate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Update a credit entry (admin only)"""
    credit = db.query(TempClubCredit).filter(TempClubCredit.id == credit_id).first()
    if not credit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Credit with ID {credit_id} not found"
        )

    update_data = credit_update.model_dump(exclude_unset=True)

    # Convert enum to string if credit_type is being updated
    if 'credit_type' in update_data and update_data['credit_type']:
        update_data['credit_type'] = update_data['credit_type'].value

    for field, value in update_data.items():
        setattr(credit, field, value)

    db.commit()
    db.refresh(credit)
    return credit


@app.delete("/api/credits/{credit_id}")
def delete_credit(
    credit_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Delete a credit entry (admin only)"""
    credit = db.query(TempClubCredit).filter(TempClubCredit.id == credit_id).first()
    if not credit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Credit with ID {credit_id} not found"
        )

    db.delete(credit)
    db.commit()
    return {"message": f"Credit {credit_id} deleted successfully"}


@app.post("/api/credits/bulk-upload")
async def bulk_upload_credits(
    file: UploadFile = File(...),
    credit_type: str = Form(...),
    mode: str = Form("merge"),
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """
    Bulk upload credits from CSV file (admin or committee only).

    - credit_type: 'total', 'activity', 'registration', or 'volunteer'
    - mode: 'replace' (delete all existing of that type first) or 'merge' (update existing, add new)
    - CSV columns: fullName, registration_sum, checkin_sum

    Note: When uploading 'activity', 'registration', or 'volunteer', total credits are automatically
    recalculated. When uploading 'total' directly, auto-recalculation is skipped.
    """
    import csv
    import io
    from decimal import Decimal, InvalidOperation

    # Validate credit_type
    valid_types = ['total', 'activity', 'registration', 'volunteer']
    if credit_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid credit_type. Must be one of: {', '.join(valid_types)}"
        )

    # Validate mode
    if mode not in ['replace', 'merge']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mode must be 'replace' or 'merge'"
        )

    # Read and parse CSV file
    try:
        contents = await file.read()
        # Try to decode as UTF-8, fallback to latin-1
        try:
            decoded = contents.decode('utf-8')
        except UnicodeDecodeError:
            decoded = contents.decode('latin-1')

        reader = csv.DictReader(io.StringIO(decoded))
        rows = list(reader)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse CSV file: {str(e)}"
        )

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file is empty"
        )

    # Validate required columns
    required_columns = ['fullName', 'registration_sum', 'checkin_sum']
    # Check for columns (case-insensitive matching)
    header_mapping = {}
    if rows:
        first_row_keys = list(rows[0].keys())
        for req_col in required_columns:
            found = False
            for key in first_row_keys:
                if key.lower().strip() == req_col.lower():
                    header_mapping[req_col] = key
                    found = True
                    break
            if not found:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Missing required column: {req_col}. Required columns: {', '.join(required_columns)}"
                )

    # If replace mode, delete all existing entries of this type
    if mode == 'replace':
        db.query(TempClubCredit).filter(TempClubCredit.credit_type == credit_type).delete()
        db.commit()

    # Process rows
    rows_processed = 0
    rows_added = 0
    rows_updated = 0
    errors = []

    for i, row in enumerate(rows, start=2):  # Start at 2 to account for header row
        try:
            full_name = row.get(header_mapping['fullName'], '').strip()
            if not full_name:
                errors.append(f"Row {i}: Empty name")
                continue

            try:
                reg_credits = Decimal(str(row.get(header_mapping['registration_sum'], '0') or '0').strip())
            except (InvalidOperation, ValueError):
                errors.append(f"Row {i}: Invalid registration_sum value")
                continue

            try:
                checkin_credits = Decimal(str(row.get(header_mapping['checkin_sum'], '0') or '0').strip())
            except (InvalidOperation, ValueError):
                errors.append(f"Row {i}: Invalid checkin_sum value")
                continue

            # Check if entry exists (for merge mode)
            existing = db.query(TempClubCredit).filter(
                TempClubCredit.full_name == full_name,
                TempClubCredit.credit_type == credit_type
            ).first()

            if existing:
                # Update existing
                existing.registration_credits = reg_credits
                existing.checkin_credits = checkin_credits
                rows_updated += 1
            else:
                # Create new
                new_credit = TempClubCredit(
                    full_name=full_name,
                    credit_type=credit_type,
                    registration_credits=reg_credits,
                    checkin_credits=checkin_credits
                )
                db.add(new_credit)
                rows_added += 1

            rows_processed += 1

        except Exception as e:
            errors.append(f"Row {i}: {str(e)}")

    db.commit()

    # Recalculate total credits for all users (skip if uploading 'total' directly)
    if credit_type == 'total':
        # Skip auto-recalculation when total is uploaded directly
        return {
            "message": "Bulk upload completed",
            "credit_type": credit_type,
            "mode": mode,
            "rows_processed": rows_processed,
            "rows_added": rows_added,
            "rows_updated": rows_updated,
            "totals_recalculated": 0,
            "errors": errors[:10] if errors else [],
            "total_errors": len(errors)
        }

    # Get all unique names from activity, registration, and volunteer types
    all_credits = db.query(TempClubCredit).filter(
        TempClubCredit.credit_type.in_(['activity', 'registration', 'volunteer'])
    ).all()

    # Aggregate by name
    totals_by_name = {}
    for credit in all_credits:
        if credit.full_name not in totals_by_name:
            totals_by_name[credit.full_name] = {
                'registration_credits': Decimal('0'),
                'checkin_credits': Decimal('0')
            }
        totals_by_name[credit.full_name]['registration_credits'] += credit.registration_credits or Decimal('0')
        totals_by_name[credit.full_name]['checkin_credits'] += credit.checkin_credits or Decimal('0')

    # Update or create total entries
    totals_updated = 0
    totals_added = 0

    # First, delete all existing total entries that are no longer needed
    existing_total_names = set(
        c.full_name for c in db.query(TempClubCredit).filter(
            TempClubCredit.credit_type == 'total'
        ).all()
    )

    # Delete totals for names no longer in the component types
    names_to_delete = existing_total_names - set(totals_by_name.keys())
    if names_to_delete:
        db.query(TempClubCredit).filter(
            TempClubCredit.credit_type == 'total',
            TempClubCredit.full_name.in_(names_to_delete)
        ).delete(synchronize_session=False)

    for name, totals in totals_by_name.items():
        existing_total = db.query(TempClubCredit).filter(
            TempClubCredit.full_name == name,
            TempClubCredit.credit_type == 'total'
        ).first()

        if existing_total:
            existing_total.registration_credits = totals['registration_credits']
            existing_total.checkin_credits = totals['checkin_credits']
            totals_updated += 1
        else:
            new_total = TempClubCredit(
                full_name=name,
                credit_type='total',
                registration_credits=totals['registration_credits'],
                checkin_credits=totals['checkin_credits']
            )
            db.add(new_total)
            totals_added += 1

    db.commit()

    return {
        "message": "Bulk upload completed",
        "credit_type": credit_type,
        "mode": mode,
        "rows_processed": rows_processed,
        "rows_added": rows_added,
        "rows_updated": rows_updated,
        "totals_recalculated": totals_updated + totals_added,
        "errors": errors[:10] if errors else [],  # Limit errors to first 10
        "total_errors": len(errors)
    }


# BANNER IMAGE ENDPOINTS

@app.get("/api/banners", response_model=List[BannerImageResponse])
def get_active_banners(db: Session = Depends(get_db)):
    """Get all active banner images, sorted by display order"""
    banners = db.query(BannerImage).filter(
        BannerImage.is_active == True
    ).order_by(BannerImage.display_order).all()
    return banners


@app.get("/api/banners/all", response_model=List[BannerImageResponse])
def get_all_banners(
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Get all banners including inactive ones (admin only)"""
    banners = db.query(BannerImage).order_by(BannerImage.display_order).all()
    return banners


@app.get("/api/banners/carousel", response_model=List[CarouselBannerResponse])
def get_carousel_banners(db: Session = Depends(get_db)):
    """
    Get carousel banners for homepage.
    Returns merged list of:
    1. Manual banners (active)
    2. Events with 'Highlight' status (auto-fetched)
    Sorted by display_order
    """
    carousel_items = []

    # Get active manual banners
    manual_banners = db.query(BannerImage).filter(
        BannerImage.is_active == True
    ).order_by(BannerImage.display_order).all()

    for banner in manual_banners:
        item = CarouselBannerResponse(
            id=banner.id,
            image_url=banner.image_url,
            alt_text=banner.alt_text,
            link_path=banner.link_path,
            label_en=banner.label_en,
            label_cn=banner.label_cn,
            display_order=banner.display_order,
            source_type=banner.source_type or 'manual',
            event_id=banner.event_id
        )

        # If banner is linked to an event, populate event details
        if banner.event_id and banner.event:
            item.event_name = banner.event.name
            item.event_chinese_name = banner.event.chinese_name
            item.event_date = banner.event.date
            item.event_time = banner.event.time
            item.event_location = banner.event.location
            item.event_description = banner.event.description
            item.event_signup_link = banner.event.signup_link

        carousel_items.append(item)

    # Get highlight events that don't already have a banner
    existing_event_ids = [b.event_id for b in manual_banners if b.event_id]
    highlight_events = db.query(Event).filter(
        Event.status == 'Highlight',
        ~Event.id.in_(existing_event_ids) if existing_event_ids else True
    ).order_by(Event.date.desc()).all()

    # Add highlight events as carousel items
    max_order = max([b.display_order for b in manual_banners], default=0)
    for idx, event in enumerate(highlight_events):
        item = CarouselBannerResponse(
            id=event.id * -1,  # Negative ID to distinguish from banners
            image_url=event.image or '/placeholder-event.png',
            alt_text=event.name,
            link_path=None,  # Will open event modal instead
            label_en=event.name,
            label_cn=event.chinese_name,
            display_order=max_order + idx + 1,
            source_type='event_highlight',
            event_id=event.id,
            event_name=event.name,
            event_chinese_name=event.chinese_name,
            event_date=event.date,
            event_time=event.time,
            event_location=event.location,
            event_description=event.description,
            event_signup_link=event.signup_link
        )
        carousel_items.append(item)

    # Sort by display_order
    carousel_items.sort(key=lambda x: x.display_order)

    return carousel_items


@app.get("/api/banners/{banner_id}", response_model=BannerImageResponse)
def get_banner(banner_id: int, db: Session = Depends(get_db)):
    """Get a specific banner by ID"""
    banner = db.query(BannerImage).filter(BannerImage.id == banner_id).first()
    if not banner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found")
    return banner


@app.post("/api/banners", response_model=BannerImageResponse)
def create_banner(
    banner: BannerImageCreate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Create a new banner (admin only)"""
    db_banner = BannerImage(**banner.model_dump())
    db.add(db_banner)
    db.commit()
    db.refresh(db_banner)
    return db_banner


@app.put("/api/banners/{banner_id}", response_model=BannerImageResponse)
def update_banner(
    banner_id: int,
    banner_update: BannerImageUpdate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Update a banner (admin only)"""
    banner = db.query(BannerImage).filter(BannerImage.id == banner_id).first()
    if not banner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found")

    update_data = banner_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(banner, field, value)

    db.commit()
    db.refresh(banner)
    return banner


@app.delete("/api/banners/{banner_id}")
def delete_banner(
    banner_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Delete a banner (admin only)"""
    banner = db.query(BannerImage).filter(BannerImage.id == banner_id).first()
    if not banner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found")

    db.delete(banner)
    db.commit()
    return {"message": f"Banner {banner_id} deleted successfully"}


# HOMEPAGE SECTION ENDPOINTS

@app.get("/api/homepage-sections", response_model=List[HomepageSectionResponse])
def get_active_sections(db: Session = Depends(get_db)):
    """Get all active homepage sections, sorted by display order"""
    sections = db.query(HomepageSection).filter(
        HomepageSection.is_active == True
    ).order_by(HomepageSection.display_order).all()
    return sections


@app.get("/api/homepage-sections/all", response_model=List[HomepageSectionResponse])
def get_all_sections(
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Get all homepage sections including inactive ones (admin only)"""
    sections = db.query(HomepageSection).order_by(HomepageSection.display_order).all()
    return sections


@app.get("/api/homepage-sections/{section_id}", response_model=HomepageSectionResponse)
def get_section(section_id: int, db: Session = Depends(get_db)):
    """Get a specific homepage section by ID"""
    section = db.query(HomepageSection).filter(HomepageSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    return section


@app.post("/api/homepage-sections", response_model=HomepageSectionResponse)
def create_section(
    section: HomepageSectionCreate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Create a new homepage section (admin only)"""
    db_section = HomepageSection(**section.model_dump())
    db.add(db_section)
    db.commit()
    db.refresh(db_section)
    return db_section


@app.put("/api/homepage-sections/{section_id}", response_model=HomepageSectionResponse)
def update_section(
    section_id: int,
    section_update: HomepageSectionUpdate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Update a homepage section (admin only)"""
    section = db.query(HomepageSection).filter(HomepageSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")

    update_data = section_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(section, field, value)

    db.commit()
    db.refresh(section)
    return section


@app.delete("/api/homepage-sections/{section_id}")
def delete_section(
    section_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Delete a homepage section (admin only)"""
    section = db.query(HomepageSection).filter(HomepageSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")

    db.delete(section)
    db.commit()
    return {"message": f"Section {section_id} deleted successfully"}


@app.put("/api/homepage-sections/reorder")
def reorder_sections(
    request: SectionReorderRequest,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Reorder homepage sections (admin only)"""
    for index, section_id in enumerate(request.section_ids):
        section = db.query(HomepageSection).filter(HomepageSection.id == section_id).first()
        if section:
            section.display_order = index

    db.commit()
    return {"message": "Sections reordered successfully"}


# IMAGE UPLOAD ENDPOINT

# Mapping of file extensions to MIME types
ALLOWED_IMAGE_EXTENSIONS = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
}

@app.post("/api/upload/image")
async def upload_image(
    file: UploadFile = File(...),
    current_admin: Member = Depends(get_current_admin)
):
    """Upload an image file (admin only). Returns base64 data URL for database storage."""
    # Get file extension
    file_ext = Path(file.filename).suffix.lower() if file.filename else ''

    # Determine MIME type from extension or content_type
    allowed_content_types = list(ALLOWED_IMAGE_EXTENSIONS.values())

    if file.content_type in allowed_content_types:
        mime_type = file.content_type
    elif file_ext in ALLOWED_IMAGE_EXTENSIONS:
        mime_type = ALLOWED_IMAGE_EXTENSIONS[file_ext]
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: JPEG, PNG, GIF, WebP"
        )

    # Validate file size (max 5MB)
    max_size = 5 * 1024 * 1024  # 5MB
    contents = await file.read()
    if len(contents) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum size is 5MB."
        )

    try:
        # Convert to base64 data URL
        base64_data = base64.b64encode(contents).decode('utf-8')
        data_url = f"data:{mime_type};base64,{base64_data}"

        return {"url": data_url}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process image: {str(e)}"
        )
    finally:
        await file.close()


# TRAINING TIP ENDPOINTS

@app.get("/api/training-tips", response_model=List[TrainingTipPublicResponse])
def get_approved_training_tips(
    category: Optional[str] = None,
    anonymous_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_member: Optional[Member] = Depends(get_current_member_optional)
):
    """Get all approved training tips"""
    query = db.query(TrainingTip).filter(TrainingTip.status == 'approved')

    if category:
        query = query.filter(TrainingTip.category == category)

    tips = query.order_by(TrainingTip.upvotes.desc(), TrainingTip.created_at.desc()).all()

    # Get user's upvotes
    user_upvoted_tips = set()
    if current_member:
        upvotes = db.query(TrainingTipUpvote.tip_id).filter(
            TrainingTipUpvote.member_id == current_member.id
        ).all()
        user_upvoted_tips = {u.tip_id for u in upvotes}
    elif anonymous_id:
        upvotes = db.query(TrainingTipUpvote.tip_id).filter(
            TrainingTipUpvote.anonymous_id == anonymous_id
        ).all()
        user_upvoted_tips = {u.tip_id for u in upvotes}

    result = []
    for tip in tips:
        tip_dict = {
            "id": tip.id,
            "category": tip.category,
            "title": tip.title,
            "title_cn": tip.title_cn,
            "content": tip.content,
            "content_cn": tip.content_cn,
            "video_url": tip.video_url,
            "video_platform": tip.video_platform,
            "author_name": tip.author_name,
            "upvotes": tip.upvotes,
            "user_upvoted": tip.id in user_upvoted_tips
        }
        result.append(TrainingTipPublicResponse(**tip_dict))

    return result


@app.get("/api/training-tips/all", response_model=List[TrainingTipResponse])
def get_all_training_tips(
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Get all training tips including pending/rejected (admin only)"""
    tips = db.query(TrainingTip).order_by(
        TrainingTip.status,
        TrainingTip.created_at.desc()
    ).all()
    return tips


@app.post("/api/training-tips", response_model=TrainingTipResponse)
def submit_training_tip(
    tip: TrainingTipCreate,
    db: Session = Depends(get_db),
    current_member: Optional[Member] = Depends(get_current_member_optional)
):
    """Submit a new training tip (anyone can submit, requires admin approval)"""
    tip_data = tip.model_dump()

    # Convert enum to string
    if 'category' in tip_data and tip_data['category']:
        tip_data['category'] = tip_data['category'].value

    # Set author info if logged in
    if current_member:
        tip_data['author_id'] = current_member.id
        tip_data['author_name'] = current_member.display_name or current_member.username

    tip_data['status'] = 'pending'

    db_tip = TrainingTip(**tip_data)
    db.add(db_tip)
    db.commit()
    db.refresh(db_tip)
    return db_tip


@app.put("/api/training-tips/{tip_id}", response_model=TrainingTipResponse)
def update_training_tip(
    tip_id: int,
    tip_update: TrainingTipUpdate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Update a training tip (admin only)"""
    tip = db.query(TrainingTip).filter(TrainingTip.id == tip_id).first()
    if not tip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tip not found")

    update_data = tip_update.model_dump(exclude_unset=True)

    # Convert enums to strings
    if 'category' in update_data and update_data['category']:
        update_data['category'] = update_data['category'].value
    if 'status' in update_data and update_data['status']:
        update_data['status'] = update_data['status'].value

    for field, value in update_data.items():
        setattr(tip, field, value)

    db.commit()
    db.refresh(tip)
    return tip


@app.put("/api/training-tips/{tip_id}/approve")
def approve_training_tip(
    tip_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Approve a pending training tip (admin only)"""
    tip = db.query(TrainingTip).filter(TrainingTip.id == tip_id).first()
    if not tip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tip not found")

    tip.status = 'approved'
    db.commit()
    return {"message": f"Tip '{tip.title}' approved successfully"}


@app.put("/api/training-tips/{tip_id}/reject")
def reject_training_tip(
    tip_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Reject a pending training tip (admin only)"""
    tip = db.query(TrainingTip).filter(TrainingTip.id == tip_id).first()
    if not tip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tip not found")

    tip.status = 'rejected'
    db.commit()
    return {"message": f"Tip '{tip.title}' rejected"}


@app.delete("/api/training-tips/{tip_id}")
def delete_training_tip(
    tip_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Delete a training tip (admin only)"""
    tip = db.query(TrainingTip).filter(TrainingTip.id == tip_id).first()
    if not tip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tip not found")

    db.delete(tip)
    db.commit()
    return {"message": f"Tip {tip_id} deleted successfully"}


@app.post("/api/training-tips/{tip_id}/upvote", response_model=TrainingTipUpvoteResponse)
def toggle_tip_upvote(
    tip_id: int,
    anonymous_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_member: Optional[Member] = Depends(get_current_member_optional)
):
    """Toggle upvote on a training tip"""
    tip = db.query(TrainingTip).filter(TrainingTip.id == tip_id).first()
    if not tip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tip not found")

    if tip.status != 'approved':
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Can only upvote approved tips")

    # Check for existing upvote
    existing_upvote = None
    if current_member:
        existing_upvote = db.query(TrainingTipUpvote).filter(
            TrainingTipUpvote.tip_id == tip_id,
            TrainingTipUpvote.member_id == current_member.id
        ).first()
    elif anonymous_id:
        existing_upvote = db.query(TrainingTipUpvote).filter(
            TrainingTipUpvote.tip_id == tip_id,
            TrainingTipUpvote.anonymous_id == anonymous_id
        ).first()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Anonymous ID required for non-logged-in users"
        )

    if existing_upvote:
        # Remove upvote
        db.delete(existing_upvote)
        tip.upvotes = max(0, tip.upvotes - 1)
        user_upvoted = False
    else:
        # Add upvote
        new_upvote = TrainingTipUpvote(
            tip_id=tip_id,
            member_id=current_member.id if current_member else None,
            anonymous_id=anonymous_id if not current_member else None
        )
        db.add(new_upvote)
        tip.upvotes += 1
        user_upvoted = True

    db.commit()
    db.refresh(tip)

    return TrainingTipUpvoteResponse(
        tip_id=tip_id,
        upvotes=tip.upvotes,
        user_upvoted=user_upvoted
    )


# EVENT GALLERY ENDPOINTS

@app.get("/api/events/{event_id}/gallery", response_model=List[EventGalleryImageResponse])
def get_event_gallery(
    event_id: int,
    anonymous_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_member: Optional[Member] = Depends(get_current_member_optional)
):
    """Get all gallery images for an event"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    images = db.query(EventGalleryImage).filter(
        EventGalleryImage.event_id == event_id,
        EventGalleryImage.is_active == True
    ).order_by(EventGalleryImage.display_order, EventGalleryImage.created_at.desc()).all()

    # Check which images the user has liked
    user_liked_ids = set()
    if current_member:
        user_likes = db.query(EventGalleryImageLike.image_id).filter(
            EventGalleryImageLike.member_id == current_member.id,
            EventGalleryImageLike.image_id.in_([img.id for img in images])
        ).all()
        user_liked_ids = {like.image_id for like in user_likes}
    elif anonymous_id:
        user_likes = db.query(EventGalleryImageLike.image_id).filter(
            EventGalleryImageLike.anonymous_id == anonymous_id,
            EventGalleryImageLike.image_id.in_([img.id for img in images])
        ).all()
        user_liked_ids = {like.image_id for like in user_likes}

    # Build response with user_liked info
    result = []
    for img in images:
        img_response = EventGalleryImageResponse(
            id=img.id,
            event_id=img.event_id,
            image_url=img.image_url,
            caption=img.caption,
            caption_cn=img.caption_cn,
            display_order=img.display_order,
            is_active=img.is_active,
            uploaded_by_id=img.uploaded_by_id,
            uploaded_by_name=img.uploaded_by_name,
            like_count=img.like_count,
            user_liked=img.id in user_liked_ids,
            created_at=img.created_at,
            updated_at=img.updated_at
        )
        result.append(img_response)

    return result


@app.get("/api/events/{event_id}/gallery/preview", response_model=EventGalleryPreviewResponse)
def get_event_gallery_preview(
    event_id: int,
    limit: int = 5,
    anonymous_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_member: Optional[Member] = Depends(get_current_member_optional)
):
    """Get first N gallery images for card preview with total count"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Get total count
    total_count = db.query(EventGalleryImage).filter(
        EventGalleryImage.event_id == event_id,
        EventGalleryImage.is_active == True
    ).count()

    # Get preview images
    images = db.query(EventGalleryImage).filter(
        EventGalleryImage.event_id == event_id,
        EventGalleryImage.is_active == True
    ).order_by(EventGalleryImage.display_order, EventGalleryImage.created_at.desc()).limit(limit).all()

    # Check which images the user has liked
    user_liked_ids = set()
    if images:
        if current_member:
            user_likes = db.query(EventGalleryImageLike.image_id).filter(
                EventGalleryImageLike.member_id == current_member.id,
                EventGalleryImageLike.image_id.in_([img.id for img in images])
            ).all()
            user_liked_ids = {like.image_id for like in user_likes}
        elif anonymous_id:
            user_likes = db.query(EventGalleryImageLike.image_id).filter(
                EventGalleryImageLike.anonymous_id == anonymous_id,
                EventGalleryImageLike.image_id.in_([img.id for img in images])
            ).all()
            user_liked_ids = {like.image_id for like in user_likes}

    # Build response
    image_responses = [
        EventGalleryImageResponse(
            id=img.id,
            event_id=img.event_id,
            image_url=img.image_url,
            caption=img.caption,
            caption_cn=img.caption_cn,
            display_order=img.display_order,
            is_active=img.is_active,
            uploaded_by_id=img.uploaded_by_id,
            uploaded_by_name=img.uploaded_by_name,
            like_count=img.like_count,
            user_liked=img.id in user_liked_ids,
            created_at=img.created_at,
            updated_at=img.updated_at
        )
        for img in images
    ]

    return EventGalleryPreviewResponse(
        images=image_responses,
        total_count=total_count,
        has_more=total_count > limit
    )


@app.post("/api/events/gallery/batch-preview", response_model=BatchGalleryPreviewResponse)
def get_batch_gallery_preview(
    request: BatchGalleryPreviewRequest,
    db: Session = Depends(get_db),
    current_member: Optional[Member] = Depends(get_current_member_optional)
):
    """Get gallery previews for multiple events in a single request"""
    previews = {}

    for event_id in request.event_ids:
        # Get total count
        total_count = db.query(EventGalleryImage).filter(
            EventGalleryImage.event_id == event_id,
            EventGalleryImage.is_active == True
        ).count()

        # Get preview images (limit 5)
        images = db.query(EventGalleryImage).filter(
            EventGalleryImage.event_id == event_id,
            EventGalleryImage.is_active == True
        ).order_by(EventGalleryImage.display_order, EventGalleryImage.created_at.desc()).limit(5).all()

        # Check which images the user has liked
        user_liked_ids = set()
        if images:
            if current_member:
                user_likes = db.query(EventGalleryImageLike.image_id).filter(
                    EventGalleryImageLike.member_id == current_member.id,
                    EventGalleryImageLike.image_id.in_([img.id for img in images])
                ).all()
                user_liked_ids = {like.image_id for like in user_likes}
            elif request.anonymous_id:
                user_likes = db.query(EventGalleryImageLike.image_id).filter(
                    EventGalleryImageLike.anonymous_id == request.anonymous_id,
                    EventGalleryImageLike.image_id.in_([img.id for img in images])
                ).all()
                user_liked_ids = {like.image_id for like in user_likes}

        # Build response for this event
        image_responses = [
            EventGalleryImageResponse(
                id=img.id,
                event_id=img.event_id,
                image_url=img.image_url,
                caption=img.caption,
                caption_cn=img.caption_cn,
                display_order=img.display_order,
                is_active=img.is_active,
                uploaded_by_id=img.uploaded_by_id,
                uploaded_by_name=img.uploaded_by_name,
                like_count=img.like_count,
                user_liked=img.id in user_liked_ids,
                created_at=img.created_at,
                updated_at=img.updated_at
            )
            for img in images
        ]

        previews[event_id] = EventGalleryPreviewResponse(
            images=image_responses,
            total_count=total_count,
            has_more=total_count > 5
        )

    return BatchGalleryPreviewResponse(previews=previews)


@app.post("/api/events/{event_id}/gallery", response_model=EventGalleryImageResponse)
async def upload_gallery_image(
    event_id: int,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    caption_cn: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    x_firebase_uid: Optional[str] = Header(None, alias="X-Firebase-UID")
):
    """Upload a new image to event gallery (authenticated users only) - stores image in S3"""
    # Validate event exists
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image (JPEG, PNG, GIF, WebP)"
        )

    # Read file content
    content = await file.read()

    # Validate file size (max 10MB)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum size is 10MB."
        )

    # Upload to S3
    image_url = upload_to_s3(content, file.filename or "image.jpg", event_id, file.content_type)

    # Get member info if authenticated
    current_member = None
    if x_firebase_uid:
        current_member = db.query(Member).filter(Member.firebase_uid == x_firebase_uid).first()

    # Get next display order
    max_order = db.query(func.max(EventGalleryImage.display_order)).filter(
        EventGalleryImage.event_id == event_id
    ).scalar() or 0

    new_image = EventGalleryImage(
        event_id=event_id,
        image_url=image_url,
        caption=caption,
        caption_cn=caption_cn,
        display_order=max_order + 1,
        uploaded_by_id=current_member.id if current_member else None,
        uploaded_by_name=current_member.display_name or current_member.username if current_member else "Anonymous"
    )

    db.add(new_image)
    db.commit()
    db.refresh(new_image)

    return EventGalleryImageResponse(
        id=new_image.id,
        event_id=new_image.event_id,
        image_url=new_image.image_url,
        caption=new_image.caption,
        caption_cn=new_image.caption_cn,
        display_order=new_image.display_order,
        is_active=new_image.is_active,
        uploaded_by_id=new_image.uploaded_by_id,
        uploaded_by_name=new_image.uploaded_by_name,
        like_count=new_image.like_count,
        user_liked=False,
        created_at=new_image.created_at,
        updated_at=new_image.updated_at
    )


@app.put("/api/gallery/{image_id}", response_model=EventGalleryImageResponse)
def update_gallery_image(
    image_id: int,
    image_update: EventGalleryImageUpdate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Update a gallery image (admin only)"""
    image = db.query(EventGalleryImage).filter(EventGalleryImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    update_data = image_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(image, field, value)

    db.commit()
    db.refresh(image)

    return EventGalleryImageResponse(
        id=image.id,
        event_id=image.event_id,
        image_url=image.image_url,
        caption=image.caption,
        caption_cn=image.caption_cn,
        display_order=image.display_order,
        is_active=image.is_active,
        uploaded_by_id=image.uploaded_by_id,
        uploaded_by_name=image.uploaded_by_name,
        like_count=image.like_count,
        user_liked=False,
        created_at=image.created_at,
        updated_at=image.updated_at
    )


@app.delete("/api/gallery/{image_id}")
def delete_gallery_image(
    image_id: int,
    db: Session = Depends(get_db),
    x_firebase_uid: Optional[str] = Header(None, alias="X-Firebase-UID")
):
    """Delete a gallery image (uploader or admin only)"""
    if not x_firebase_uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )

    # Get the image
    image = db.query(EventGalleryImage).filter(EventGalleryImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    # Get the member
    member = db.query(Member).filter(Member.firebase_uid == x_firebase_uid).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Member not found"
        )

    # Check permission: admin/committee OR uploader
    is_admin = member.status in ['admin', 'committee']
    is_uploader = image.uploaded_by_id == member.id

    if not (is_admin or is_uploader):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied. Only the uploader or admins can delete this image."
        )

    # Delete from S3 first (if it's an S3 URL)
    delete_from_s3(image.image_url)

    # Then delete from database
    db.delete(image)
    db.commit()
    return {"message": f"Gallery image {image_id} deleted successfully"}


@app.post("/api/gallery/{image_id}/likes", response_model=EventGalleryImageLikeResponse)
def toggle_gallery_image_like(
    image_id: int,
    anonymous_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_member: Optional[Member] = Depends(get_current_member_optional)
):
    """Toggle like on a gallery image"""
    image = db.query(EventGalleryImage).filter(EventGalleryImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    # Check for existing like
    existing_like = None
    if current_member:
        existing_like = db.query(EventGalleryImageLike).filter(
            EventGalleryImageLike.image_id == image_id,
            EventGalleryImageLike.member_id == current_member.id
        ).first()
    elif anonymous_id:
        existing_like = db.query(EventGalleryImageLike).filter(
            EventGalleryImageLike.image_id == image_id,
            EventGalleryImageLike.anonymous_id == anonymous_id
        ).first()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Anonymous ID required for non-logged-in users"
        )

    if existing_like:
        # Unlike
        db.delete(existing_like)
        image.like_count = max(0, image.like_count - 1)
        user_liked = False
    else:
        # Like
        new_like = EventGalleryImageLike(
            image_id=image_id,
            member_id=current_member.id if current_member else None,
            firebase_uid=current_member.firebase_uid if current_member else None,
            anonymous_id=anonymous_id if not current_member else None
        )
        db.add(new_like)
        image.like_count += 1
        user_liked = True

    db.commit()
    db.refresh(image)

    return EventGalleryImageLikeResponse(
        image_id=image_id,
        like_count=image.like_count,
        user_liked=user_liked
    )


# EVENT RECURRENCE ENDPOINTS

@app.get("/api/events/{event_id}/recurrence", response_model=EventRecurrenceRuleResponse)
def get_event_recurrence(
    event_id: int,
    db: Session = Depends(get_db)
):
    """Get recurrence rule for an event"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    rule = db.query(EventRecurrenceRule).filter(
        EventRecurrenceRule.event_id == event_id
    ).first()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No recurrence rule found for this event")

    return rule


@app.post("/api/events/{event_id}/recurrence", response_model=EventRecurrenceRuleResponse)
def create_event_recurrence(
    event_id: int,
    rule_data: EventRecurrenceRuleCreate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Create a recurrence rule for an event (admin only)"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Check if rule already exists
    existing_rule = db.query(EventRecurrenceRule).filter(
        EventRecurrenceRule.event_id == event_id
    ).first()
    if existing_rule:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recurrence rule already exists for this event. Use PUT to update."
        )

    # Create rule
    rule = EventRecurrenceRule(
        event_id=event_id,
        recurrence_type=rule_data.recurrence_type.value,
        days_of_week=rule_data.days_of_week,
        day_of_month=rule_data.day_of_month,
        week_of_month=rule_data.week_of_month,
        month_of_year=rule_data.month_of_year,
        custom_rule=rule_data.custom_rule,
        end_date=rule_data.end_date,
        max_occurrences=rule_data.max_occurrences
    )

    # Update event to be recurring
    event.is_recurring = True

    db.add(rule)
    db.commit()
    db.refresh(rule)

    return rule


@app.put("/api/events/{event_id}/recurrence", response_model=EventRecurrenceRuleResponse)
def update_event_recurrence(
    event_id: int,
    rule_update: EventRecurrenceRuleUpdate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Update recurrence rule for an event (admin only)"""
    rule = db.query(EventRecurrenceRule).filter(
        EventRecurrenceRule.event_id == event_id
    ).first()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No recurrence rule found for this event")

    update_data = rule_update.model_dump(exclude_unset=True)

    # Convert enum to string if present
    if 'recurrence_type' in update_data and update_data['recurrence_type']:
        update_data['recurrence_type'] = update_data['recurrence_type'].value

    for field, value in update_data.items():
        setattr(rule, field, value)

    db.commit()
    db.refresh(rule)

    return rule


@app.delete("/api/events/{event_id}/recurrence")
def delete_event_recurrence(
    event_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Delete recurrence rule for an event (stops future occurrences, admin only)"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    rule = db.query(EventRecurrenceRule).filter(
        EventRecurrenceRule.event_id == event_id
    ).first()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No recurrence rule found for this event")

    # Update event
    event.is_recurring = False

    db.delete(rule)
    db.commit()

    return {"message": "Recurrence rule deleted. No new occurrences will be generated."}


@app.post("/api/events/{event_id}/recurrence/generate")
def manually_generate_recurrence(
    event_id: int,
    count: int = 1,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Manually generate recurring event instances (admin only)"""
    from datetime import date, timedelta
    import json

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    rule = db.query(EventRecurrenceRule).filter(
        EventRecurrenceRule.event_id == event_id,
        EventRecurrenceRule.is_active == True
    ).first()
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active recurrence rule found for this event"
        )

    # Check if max occurrences reached
    if rule.max_occurrences and rule.occurrences_created >= rule.max_occurrences:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum occurrences ({rule.max_occurrences}) already reached"
        )

    generated_events = []
    base_date = rule.last_generated_date or event.date
    current_date = base_date

    for i in range(count):
        # Calculate next occurrence based on recurrence type
        if rule.recurrence_type == 'weekly':
            current_date = current_date + timedelta(weeks=1)
        elif rule.recurrence_type == 'biweekly':
            current_date = current_date + timedelta(weeks=2)
        elif rule.recurrence_type == 'monthly':
            # Simple monthly: add one month
            if rule.day_of_month:
                month = current_date.month + 1
                year = current_date.year
                if month > 12:
                    month = 1
                    year += 1
                day = min(rule.day_of_month, 28)  # Safe for all months
                current_date = date(year, month, day)
            else:
                current_date = current_date + timedelta(days=30)
        elif rule.recurrence_type == 'yearly':
            current_date = date(current_date.year + 1, current_date.month, current_date.day)
        else:
            # Custom: try to parse custom_rule JSON
            if rule.custom_rule:
                try:
                    custom = json.loads(rule.custom_rule)
                    interval_days = custom.get('interval_days', 7)
                    current_date = current_date + timedelta(days=interval_days)
                except:
                    current_date = current_date + timedelta(weeks=1)
            else:
                current_date = current_date + timedelta(weeks=1)

        # Check if past end date
        if rule.end_date and current_date > rule.end_date:
            break

        # Check if max occurrences reached
        if rule.max_occurrences and rule.occurrences_created + len(generated_events) + 1 > rule.max_occurrences:
            break

        # Create new event instance
        new_event = Event(
            name=event.name,
            chinese_name=event.chinese_name,
            date=current_date,
            time=event.time,
            location=event.location,
            chinese_location=event.chinese_location,
            description=event.description,
            chinese_description=event.chinese_description,
            image=event.image,
            signup_link=event.signup_link,
            status='Upcoming',
            event_type=event.event_type,
            heylo_embed=event.heylo_embed,
            is_recurring=False,  # Instance is not itself recurring
            parent_event_id=event_id
        )

        db.add(new_event)
        generated_events.append({
            "date": str(current_date),
            "name": event.name
        })

    # Update rule tracking
    if generated_events:
        rule.last_generated_date = current_date
        rule.occurrences_created += len(generated_events)

    db.commit()

    return {
        "message": f"Generated {len(generated_events)} recurring event instances",
        "events": generated_events
    }


@app.get("/api/events/{event_id}/with-recurrence", response_model=EventWithRecurrence)
def get_event_with_recurrence(
    event_id: int,
    db: Session = Depends(get_db)
):
    """Get event with its recurrence rule (if any)"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Get recurrence rule if exists
    rule = db.query(EventRecurrenceRule).filter(
        EventRecurrenceRule.event_id == event_id
    ).first()

    return EventWithRecurrence(
        id=event.id,
        name=event.name,
        chinese_name=event.chinese_name,
        date=event.date,
        time=event.time,
        location=event.location,
        chinese_location=event.chinese_location,
        description=event.description,
        chinese_description=event.chinese_description,
        image=event.image,
        signup_link=event.signup_link,
        status=event.status,
        event_type=event.event_type or 'standard',
        heylo_embed=event.heylo_embed,
        is_recurring=event.is_recurring or False,
        parent_event_id=event.parent_event_id,
        next_occurrence_date=event.next_occurrence_date,
        recurrence=rule,
        created_at=event.created_at,
        updated_at=event.updated_at
    )


@app.get("/api/events/{event_id}/series", response_model=List[EventResponse])
def get_event_series(
    event_id: int,
    db: Session = Depends(get_db)
):
    """Get all events in a recurring series."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Determine parent ID
    if event.is_recurring and event.parent_event_id is None:
        # This is the parent event
        parent_id = event.id
    elif event.parent_event_id:
        # This is a child event
        parent_id = event.parent_event_id
    else:
        # Not recurring, return just this event
        return [event]

    # Get parent and all children
    parent = db.query(Event).filter(Event.id == parent_id).first()
    children = db.query(Event).filter(Event.parent_event_id == parent_id).all()

    # Combine parent (if it has a date) and children
    from datetime import date as date_type
    series = ([parent] if parent and parent.date else []) + children
    series.sort(key=lambda e: e.date or date_type.min, reverse=True)
    return series


@app.post("/api/events/{event_id}/add-to-series/{parent_id}")
def add_event_to_series(
    event_id: int,
    parent_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Add an existing event to a recurring series (admin only)."""
    # Get the event to be added
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Get the parent event
    parent = db.query(Event).filter(Event.id == parent_id).first()
    if not parent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent event not found")

    # Verify parent is a recurring event
    if not parent.is_recurring:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target event is not a recurring series"
        )

    # Prevent adding the parent to itself
    if event_id == parent_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot add an event to itself"
        )

    # Update the event
    event.parent_event_id = parent_id
    event.is_recurring = False  # Child events are not recurring themselves
    db.commit()

    return {"message": f"Event {event_id} added to series {parent_id}"}


@app.post("/api/events/{event_id}/toggle-series-parent")
def toggle_series_parent(
    event_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Toggle an event as a series parent (admin only)."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if event.parent_event_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot mark a child event as a series parent"
        )

    event.is_recurring = not event.is_recurring
    db.commit()

    return {"message": f"Event {'marked' if event.is_recurring else 'unmarked'} as series parent",
            "is_recurring": event.is_recurring}


@app.post("/api/events/{event_id}/dissolve-series")
def dissolve_series(
    event_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Dissolve a series - unlink all children (admin only)."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event or not event.is_recurring:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a series parent")

    children = db.query(Event).filter(Event.parent_event_id == event_id).all()
    for child in children:
        child.parent_event_id = None
    event.is_recurring = False
    db.commit()

    return {"message": f"Series dissolved. {len(children)} events unlinked."}


@app.post("/api/events/{event_id}/remove-from-series")
def remove_event_from_series(
    event_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Remove an event from its series (admin only)."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event or not event.parent_event_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event not in a series")

    event.parent_event_id = None
    db.commit()
    return {"message": "Event removed from series"}


# ========== Site Settings Endpoints ==========

def seed_social_links(db: Session):
    """Seed default social media links if they don't exist."""
    default_links = [
        {
            "key": "social_instagram",
            "value": "https://www.instagram.com/newbeerunningclub/",
            "label_en": "Instagram",
            "label_cn": "Instagram",
            "category": "social"
        },
        {
            "key": "social_xiaohongshu",
            "value": "https://xhslink.com/m/8znk8WTxhjd",
            "label_en": "Xiaohongshu",
            "label_cn": "小红书",
            "category": "social"
        },
        {
            "key": "social_heylo",
            "value": "https://www.heylo.com/g/b7bf1310-ca40-4d4d-9da5-2b7f4f3c197e",
            "label_en": "Heylo",
            "label_cn": "Heylo",
            "category": "social"
        },
        {
            "key": "social_shop",
            "value": "",
            "label_en": "Shop",
            "label_cn": "商店",
            "category": "social"
        }
    ]

    for link_data in default_links:
        existing = db.query(SiteSetting).filter(SiteSetting.key == link_data["key"]).first()
        if not existing:
            new_setting = SiteSetting(**link_data)
            db.add(new_setting)

    db.commit()


@app.on_event("startup")
def seed_settings():
    """Seed default site settings on startup."""
    db = next(get_db())
    try:
        seed_social_links(db)
    finally:
        db.close()


@app.get("/api/settings/social-links", response_model=SocialLinksResponse)
def get_social_links(db: Session = Depends(get_db)):
    """Get all social media links (public endpoint)."""
    settings = db.query(SiteSetting).filter(
        SiteSetting.category == "social",
        SiteSetting.is_active == True
    ).all()

    result = SocialLinksResponse()
    for setting in settings:
        if setting.key == "social_instagram":
            result.instagram = setting.value
        elif setting.key == "social_xiaohongshu":
            result.xiaohongshu = setting.value
        elif setting.key == "social_heylo":
            result.heylo = setting.value
        elif setting.key == "social_shop":
            result.shop = setting.value

    return result


@app.get("/api/settings", response_model=List[SiteSettingResponse])
def get_all_settings(
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """Get all site settings (admin/committee only)."""
    return db.query(SiteSetting).order_by(SiteSetting.category, SiteSetting.key).all()


@app.get("/api/settings/category/{category}", response_model=List[SiteSettingResponse])
def get_settings_by_category(
    category: str,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """Get settings by category (admin/committee only)."""
    return db.query(SiteSetting).filter(SiteSetting.category == category).all()


@app.put("/api/settings/{key}", response_model=SiteSettingResponse)
def update_setting(
    key: str,
    setting_update: SiteSettingUpdate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """Update a site setting by key (admin/committee only)."""
    setting = db.query(SiteSetting).filter(SiteSetting.key == key).first()
    if not setting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Setting with key '{key}' not found"
        )

    # Update fields if provided
    update_data = setting_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(setting, field, value)

    db.commit()
    db.refresh(setting)
    return setting


@app.post("/api/settings", response_model=SiteSettingResponse)
def create_setting(
    setting: SiteSettingCreate,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Create a new site setting (admin only)."""
    existing = db.query(SiteSetting).filter(SiteSetting.key == setting.key).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Setting with key '{setting.key}' already exists"
        )

    new_setting = SiteSetting(**setting.model_dump())
    db.add(new_setting)
    db.commit()
    db.refresh(new_setting)
    return new_setting


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("API_HOST", "0.0.0.0"),
        port=int(os.getenv("API_PORT", 8000)),
        reload=os.getenv("DEBUG", "False").lower() == "true"
    )