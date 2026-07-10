"""Event gallery endpoints for image upload, likes, and deletion requests."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Header, File, UploadFile, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional

from database import (
    get_db, Event, Member, EventGalleryImage, EventGalleryImageLike,
    GalleryDeletionRequest
)
from models import (
    EventGalleryImageUpdate, EventGalleryImageResponse,
    EventGalleryPreviewResponse, EventGalleryImageLikeResponse,
    BatchGalleryPreviewRequest, BatchGalleryPreviewResponse,
    GalleryDeletionRequestCreate, GalleryDeletionRequestResolve,
    GalleryDeletionRequestResponse
)
from utils.auth import get_current_member_optional, get_current_committee_or_admin
from utils.s3 import upload_to_s3, delete_from_s3

router = APIRouter(tags=["Event Gallery"])


@router.get("/api/events/{event_id}/gallery", response_model=List[EventGalleryImageResponse])
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

    # Check pending deletion requests
    image_ids = [img.id for img in images]
    pending_requests = {}  # image_id -> GalleryDeletionRequestResponse
    user_requested_ids = set()
    if image_ids:
        pending_reqs = db.query(GalleryDeletionRequest).filter(
            GalleryDeletionRequest.image_id.in_(image_ids),
            GalleryDeletionRequest.status == 'pending'
        ).all()
        # Batch query all requesters to avoid N+1
        requester_ids = {req.requested_by_id for req in pending_reqs}
        requesters = {m.id: m for m in db.query(Member).filter(Member.id.in_(requester_ids)).all()} if requester_ids else {}
        for req in pending_reqs:
            if req.image_id not in pending_requests:
                requester = requesters.get(req.requested_by_id)
                pending_requests[req.image_id] = GalleryDeletionRequestResponse(
                    id=req.id,
                    image_id=req.image_id,
                    requested_by_id=req.requested_by_id,
                    requested_by_name=requester.display_name or requester.username if requester else None,
                    reason=req.reason,
                    status=req.status,
                    created_at=req.created_at
                )
            if current_member and req.requested_by_id == current_member.id:
                user_requested_ids.add(req.image_id)

    is_admin = current_member and current_member.status in ['admin', 'committee']

    # Build response with user_liked and deletion request info
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
            has_pending_deletion_request=img.id in pending_requests,
            user_requested_deletion=img.id in user_requested_ids,
            deletion_request=pending_requests.get(img.id) if is_admin else None,
            created_at=img.created_at,
            updated_at=img.updated_at
        )
        result.append(img_response)

    return result


@router.get("/api/events/{event_id}/gallery/preview", response_model=EventGalleryPreviewResponse)
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


@router.post("/api/events/gallery/batch-preview", response_model=BatchGalleryPreviewResponse)
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


@router.post("/api/events/{event_id}/gallery", response_model=EventGalleryImageResponse)
async def upload_gallery_image(
    event_id: int,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    caption_cn: Optional[str] = Form(None),
    uploaded_by_name: Optional[str] = Form(None),
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

    # Validate file size (max 25MB - frontend compresses before upload)
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum size is 25MB."
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
        uploaded_by_name=uploaded_by_name or (current_member.display_name or current_member.username if current_member else "Anonymous")
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


@router.put("/api/gallery/{image_id}", response_model=EventGalleryImageResponse)
def update_gallery_image(
    image_id: int,
    image_update: EventGalleryImageUpdate,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_committee_or_admin)
):
    """Update a gallery image (committee or admin)"""
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


@router.delete("/api/gallery/{image_id}")
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


@router.post("/api/gallery/{image_id}/likes", response_model=EventGalleryImageLikeResponse)
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


# GALLERY DELETION REQUEST ENDPOINTS

@router.post("/api/gallery/{image_id}/deletion-request", response_model=GalleryDeletionRequestResponse)
def request_gallery_image_deletion(
    image_id: int,
    request_data: GalleryDeletionRequestCreate,
    db: Session = Depends(get_db),
    x_firebase_uid: Optional[str] = Header(None, alias="X-Firebase-UID")
):
    """Submit a deletion request for a gallery image (any logged-in user)"""
    if not x_firebase_uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    member = db.query(Member).filter(Member.firebase_uid == x_firebase_uid).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Member not found")

    image = db.query(EventGalleryImage).filter(EventGalleryImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    # Check for existing pending request from this user
    existing = db.query(GalleryDeletionRequest).filter(
        GalleryDeletionRequest.image_id == image_id,
        GalleryDeletionRequest.requested_by_id == member.id,
        GalleryDeletionRequest.status == 'pending'
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You have already submitted a deletion request for this image")

    new_request = GalleryDeletionRequest(
        image_id=image_id,
        requested_by_id=member.id,
        reason=request_data.reason,
        status='pending'
    )
    db.add(new_request)
    db.commit()
    db.refresh(new_request)

    return GalleryDeletionRequestResponse(
        id=new_request.id,
        image_id=new_request.image_id,
        requested_by_id=new_request.requested_by_id,
        requested_by_name=member.display_name or member.username,
        reason=new_request.reason,
        status=new_request.status,
        created_at=new_request.created_at
    )


@router.put("/api/gallery/deletion-request/{request_id}", response_model=GalleryDeletionRequestResponse)
def resolve_gallery_deletion_request(
    request_id: int,
    resolve_data: GalleryDeletionRequestResolve,
    db: Session = Depends(get_db),
    x_firebase_uid: Optional[str] = Header(None, alias="X-Firebase-UID")
):
    """Approve or reject a gallery deletion request (admin only)"""
    if not x_firebase_uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    member = db.query(Member).filter(Member.firebase_uid == x_firebase_uid).first()
    if not member or member.status not in ['admin', 'committee']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    del_request = db.query(GalleryDeletionRequest).filter(
        GalleryDeletionRequest.id == request_id
    ).first()
    if not del_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deletion request not found")

    if del_request.status != 'pending':
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This request has already been resolved")

    requester = db.query(Member).filter(Member.id == del_request.requested_by_id).first()
    requester_name = (requester.display_name or requester.username) if requester else None

    if resolve_data.approved:
        # Delete the image from S3 and DB
        image = db.query(EventGalleryImage).filter(EventGalleryImage.id == del_request.image_id).first()
        if image:
            # Deleting the image cascades to its likes and deletion requests
            # (including this one), so capture the response before deleting.
            response = GalleryDeletionRequestResponse(
                id=del_request.id,
                image_id=del_request.image_id,
                requested_by_id=del_request.requested_by_id,
                requested_by_name=requester_name,
                reason=del_request.reason,
                status='approved',
                resolved_by_id=member.id,
                resolved_at=datetime.now(timezone.utc),
                created_at=del_request.created_at
            )
            delete_from_s3(image.image_url)
            db.delete(image)
            db.commit()
            return response

        del_request.status = 'approved'
    else:
        del_request.status = 'rejected'

    del_request.resolved_by_id = member.id
    del_request.resolved_at = func.now()
    db.commit()
    db.refresh(del_request)

    return GalleryDeletionRequestResponse(
        id=del_request.id,
        image_id=del_request.image_id,
        requested_by_id=del_request.requested_by_id,
        requested_by_name=requester_name,
        reason=del_request.reason,
        status=del_request.status,
        resolved_by_id=del_request.resolved_by_id,
        resolved_at=del_request.resolved_at,
        created_at=del_request.created_at
    )
