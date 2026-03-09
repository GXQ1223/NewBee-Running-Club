"""Member management endpoints."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel
import bcrypt
import logging
import html as html_module

from database import get_db, Member, SiteSetting
from models import (
    MemberCreate, MemberUpdate, MemberResponse, MemberPublicResponse, MemberStatus,
    FirebaseUserSync, JoinApplicationRequest, ExistingMemberAccountRequest
)
from utils.auth import get_current_admin, get_current_committee_or_admin
from email_service import EmailService, WEBSITE_URL

logger = logging.getLogger(__name__)

router = APIRouter(tags=["members"])

BLOCKED_STATUSES = ['rejected', 'suspended', 'quit']


class RejectMemberRequest(BaseModel):
    rejection_reason: str


class NewsletterRequest(BaseModel):
    subject: str
    content: str


@router.get("/api/members")
def get_all_members(
    x_firebase_uid: Optional[str] = Header(None, alias="X-Firebase-UID"),
    db: Session = Depends(get_db)
):
    """Get all members. Returns full data for admin/committee, public data otherwise."""
    # Check if caller is admin or committee
    if x_firebase_uid:
        caller = db.query(Member).filter(Member.firebase_uid == x_firebase_uid).first()
        if caller and caller.status in ('admin', 'committee'):
            # Return full member data for admin/committee
            all_members = db.query(Member).order_by(Member.display_name).all()
            return [MemberResponse.model_validate(m) for m in all_members]

    # Public: active members only, limited fields
    members = db.query(Member).filter(
        Member.status.in_(['runner', 'committee', 'admin'])
    ).order_by(Member.display_name).all()
    return [MemberPublicResponse.model_validate(m) for m in members]


@router.get("/api/members/credits", response_model=List[MemberPublicResponse])
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


@router.get("/api/members/{member_id}", response_model=MemberResponse)
def get_member(member_id: int, db: Session = Depends(get_db)):
    """Get a specific member by ID (full info for authenticated user)"""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {member_id} not found"
        )
    return member


@router.get("/api/members/username/{username}", response_model=MemberResponse)
def get_member_by_username(username: str, db: Session = Depends(get_db)):
    """Get a specific member by username"""
    member = db.query(Member).filter(Member.username == username).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with username {username} not found"
        )
    return member


@router.post("/api/members", response_model=MemberResponse)
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


@router.put("/api/members/{member_id}", response_model=MemberResponse)
def update_member(
    member_id: int,
    member_update: MemberUpdate,
    x_firebase_uid: Optional[str] = Header(None, alias="X-Firebase-UID"),
    db: Session = Depends(get_db)
):
    """Update a member. Locked fields (display_name, gender, birth_year) cannot be
    changed by regular users once set — only admins can modify them."""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {member_id} not found"
        )

    # Check if the caller is an admin
    is_admin = False
    if x_firebase_uid:
        caller = db.query(Member).filter(Member.firebase_uid == x_firebase_uid).first()
        if caller and caller.status == 'admin':
            is_admin = True

    update_data = member_update.model_dump(exclude_unset=True)

    # Locked fields: once set, only admins can change them
    # This prevents users from changing name/gender/birth_year to view other runners' race records
    locked_fields = ['display_name']
    if not is_admin:
        for field in locked_fields:
            if field in update_data and getattr(member, field):
                # Field already has a value and caller is not admin — remove from update
                del update_data[field]

    # Convert enum to string if status is being updated
    if 'status' in update_data and update_data['status']:
        update_data['status'] = update_data['status'].value

    for field, value in update_data.items():
        setattr(member, field, value)

    db.commit()
    db.refresh(member)
    return member


@router.put("/api/members/{member_id}/privacy", response_model=MemberResponse)
def update_member_privacy(
    member_id: int,
    show_in_credits: bool = None,
    show_in_donors: bool = None,
    x_firebase_uid: Optional[str] = Header(None, alias="X-Firebase-UID"),
    db: Session = Depends(get_db)
):
    """Update member privacy settings (for dashboard toggle)"""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {member_id} not found"
        )

    # Verify the caller owns this member record or is admin
    if x_firebase_uid:
        caller = db.query(Member).filter(Member.firebase_uid == x_firebase_uid).first()
        if not caller or (caller.id != member_id and caller.status not in ('admin', 'committee')):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only update your own privacy settings.")
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    if show_in_credits is not None:
        member.show_in_credits = show_in_credits
    if show_in_donors is not None:
        member.show_in_donors = show_in_donors

    db.commit()
    db.refresh(member)
    return member


@router.delete("/api/members/{member_id}")
def delete_member(
    member_id: int,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
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


@router.get("/api/members/committee/list", response_model=List[MemberPublicResponse])
def get_committee_members(db: Session = Depends(get_db)):
    """Get all committee members (admin status indicates committee member)"""
    members = db.query(Member).filter(
        Member.status.in_(['admin', 'committee'])
    ).order_by(Member.display_name).all()
    return members


@router.post("/api/members/firebase-sync", response_model=MemberResponse)
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


@router.get("/api/members/firebase/{firebase_uid}", response_model=MemberResponse)
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


@router.get("/api/members/pending/list", response_model=List[MemberResponse])
def get_pending_members(
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Get all pending member applications (for admin panel) - Committee or Admin"""
    members = db.query(Member).filter(
        Member.status == 'pending'
    ).order_by(Member.created_at.desc()).all()
    return members


@router.put("/api/members/{member_id}/approve")
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
        logger.error(f"Error sending approval email: {str(e)}")
        # Don't fail the request if email fails

    return {"message": f"Member {member.display_name or member.username} approved successfully", "member_id": member_id}


@router.put("/api/members/{member_id}/reject")
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
    member.status_updated_at = datetime.now(timezone.utc)
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
        logger.error(f"Failed to send rejection email: {e}")

    return {"message": f"Member application rejected", "member_id": member_id}


@router.post("/api/join/submit")
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
        nickname=application.nickname,
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
        logger.error(f"Error sending emails: {str(e)}")
        # Don't fail the request if email fails, just log it

    return {
        "message": "Application submitted successfully! You will receive a confirmation email shortly.",
        "member_id": new_member.id,
        "status": "pending"
    }


@router.post("/api/members/existing-member-account-request")
def existing_member_account_request(request: ExistingMemberAccountRequest):
    """
    Notify committee that an existing club member has created a website account
    and is requesting approval. Sends an email to the club email for committee review.
    """
    try:
        EmailService.send_existing_member_account_notification(
            request.name,
            request.email
        )
    except Exception as e:
        logger.error(f"Error sending existing member account notification email: {str(e)}")
        # Don't fail the request if email fails

    return {
        "message": "Account request notification sent to committee.",
        "status": "pending"
    }


@router.post("/api/newsletter/send")
def send_newsletter(
    request: NewsletterRequest,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """Send a newsletter email to all active members (admin/committee only)."""
    subject = html_module.escape(request.subject.strip().replace('\n', ' ').replace('\r', ' '))
    content = request.content.strip()

    if not subject or not content:
        raise HTTPException(status_code=400, detail="Subject and content are required.")

    # Get all active members with emails
    members = db.query(Member).filter(
        Member.status.in_(['runner', 'committee', 'admin']),
        Member.email.isnot(None),
        Member.email != ''
    ).all()

    if not members:
        return {"sent": 0, "failed": 0, "message": "No active members found."}

    # Build HTML email
    content_html = html_module.escape(content).replace('\n', '<br>')
    body_html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #FFA500;">{html_module.escape(subject)}</h2>
                <div style="margin: 20px 0;">{content_html}</div>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
                <p style="color: #999; font-size: 12px;">
                    NewBee Running Club | <a href="{WEBSITE_URL}" style="color: #FFA500;">newbeerunningclub.org</a>
                </p>
            </div>
        </body>
    </html>
    """

    sent = 0
    failed = 0
    for member in members:
        try:
            success = EmailService.send_email(member.email, subject, body_html, content)
            if success:
                sent += 1
            else:
                failed += 1
        except Exception:
            failed += 1

    return {"sent": sent, "failed": failed, "total": len(members)}


# COMMITTEE ROLE MANAGEMENT ENDPOINTS (Admin only)

@router.put("/api/members/{member_id}/promote-to-committee")
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


@router.put("/api/members/{member_id}/demote-from-committee")
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


@router.get("/api/members/committee/all", response_model=List[MemberPublicResponse])
def get_all_committee_and_admins(db: Session = Depends(get_db)):
    """Get all committee members and admins"""
    members = db.query(Member).filter(
        Member.status.in_(['admin', 'committee'])
    ).order_by(Member.status.desc(), Member.display_name).all()
    return members
