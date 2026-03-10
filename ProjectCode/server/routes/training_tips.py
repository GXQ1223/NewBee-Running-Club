"""Training tip endpoints for submitting, managing, and upvoting tips."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db, TrainingTip, TrainingTipUpvote, Member
from models import (
    TrainingTipCreate, TrainingTipUpdate, TrainingTipResponse,
    TrainingTipPublicResponse, TrainingTipUpvoteResponse
)
from utils.auth import get_current_admin, get_current_member_optional

router = APIRouter(tags=["Training Tips"])


@router.get("/api/training-tips", response_model=List[TrainingTipPublicResponse])
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


@router.get("/api/training-tips/all", response_model=List[TrainingTipResponse])
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


@router.post("/api/training-tips", response_model=TrainingTipResponse)
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


@router.put("/api/training-tips/{tip_id}", response_model=TrainingTipResponse)
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


@router.put("/api/training-tips/{tip_id}/approve")
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


@router.put("/api/training-tips/{tip_id}/reject")
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


@router.delete("/api/training-tips/{tip_id}")
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


@router.post("/api/training-tips/{tip_id}/upvote", response_model=TrainingTipUpvoteResponse)
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
        db.delete(existing_upvote)
        user_upvoted = False
    else:
        new_upvote = TrainingTipUpvote(
            tip_id=tip_id,
            member_id=current_member.id if current_member else None,
            anonymous_id=anonymous_id if not current_member else None
        )
        db.add(new_upvote)
        user_upvoted = True

    db.flush()
    tip.upvotes = db.query(TrainingTipUpvote).filter(TrainingTipUpvote.tip_id == tip_id).count()
    db.commit()
    db.refresh(tip)

    return TrainingTipUpvoteResponse(
        tip_id=tip_id,
        upvotes=tip.upvotes,
        user_upvoted=user_upvoted
    )
