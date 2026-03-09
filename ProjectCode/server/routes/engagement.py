"""Engagement endpoints: comments, likes, reactions."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional

from database import get_db, Event, Member, Comment, Like, Reaction, EventCommentSettings
from models import (
    CommentCreate, CommentResponse, CommentWithModeration, CommentHideRequest,
    LikeCreate, LikeResponse, LikeCountResponse,
    ReactionCreate, ReactionCountResponse, EventReactionsResponse, ALLOWED_EMOJIS,
    EventCommentSettingsUpdate, EventCommentSettingsResponse,
    EventEngagementResponse, BatchEngagementRequest, BatchEngagementResponse
)
from utils.auth import get_current_admin, get_current_member_optional, get_current_member_required

router = APIRouter(tags=["engagement"])


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

@router.get("/api/events/{event_id}/comments", response_model=List[CommentResponse])
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


@router.get("/api/events/{event_id}/comments/all", response_model=List[CommentWithModeration])
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


@router.post("/api/events/{event_id}/comments", response_model=CommentResponse)
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


@router.delete("/api/comments/{comment_id}")
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_member: Member = Depends(get_current_member_required)
):
    """Delete own comment"""
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    # Check ownership or admin/committee
    if comment.member_id != current_member.id and current_member.status not in ('admin', 'committee'):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comments"
        )

    db.delete(comment)
    db.commit()
    return {"message": "Comment deleted successfully"}


@router.put("/api/comments/{comment_id}/highlight")
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


@router.put("/api/comments/{comment_id}/hide")
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
    comment.hidden_at = datetime.now(timezone.utc)
    comment.hidden_reason = hide_request.reason
    db.commit()
    return {"message": "Comment hidden successfully"}


@router.put("/api/comments/{comment_id}/unhide")
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

@router.get("/api/events/{event_id}/likes", response_model=LikeCountResponse)
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


@router.post("/api/events/{event_id}/likes", response_model=LikeCountResponse)
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


@router.delete("/api/events/{event_id}/likes")
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

@router.get("/api/events/{event_id}/reactions", response_model=EventReactionsResponse)
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


@router.post("/api/events/{event_id}/reactions", response_model=EventReactionsResponse)
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


@router.delete("/api/events/{event_id}/reactions/{emoji}")
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

@router.get("/api/events/{event_id}/engagement", response_model=EventEngagementResponse)
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


@router.post("/api/events/engagement/batch", response_model=BatchEngagementResponse)
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

@router.get("/api/events/{event_id}/settings", response_model=EventCommentSettingsResponse)
def get_event_settings(event_id: int, db: Session = Depends(get_db)):
    """Get event engagement settings"""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    settings = get_or_create_event_settings(event_id, db)
    return settings


@router.put("/api/events/{event_id}/settings", response_model=EventCommentSettingsResponse)
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
        settings.closed_at = datetime.now(timezone.utc)
        settings.closed_by = current_admin.id

    db.commit()
    db.refresh(settings)
    return settings
