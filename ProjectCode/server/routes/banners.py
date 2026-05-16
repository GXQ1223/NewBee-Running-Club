"""Banner image endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db, BannerImage, Event, Member
from models import BannerImageCreate, BannerImageUpdate, BannerImageResponse, CarouselBannerResponse
from utils.auth import get_current_admin, get_current_committee_or_admin

router = APIRouter(prefix="/api/banners", tags=["banners"])


@router.get("", response_model=List[BannerImageResponse])
def get_active_banners(db: Session = Depends(get_db)):
    """Get all active banner images, sorted by display order"""
    banners = db.query(BannerImage).filter(
        BannerImage.is_active == True
    ).order_by(BannerImage.display_order).all()
    return banners


@router.get("/all", response_model=List[BannerImageResponse])
def get_all_banners(
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Get all banners including inactive ones (admin only)"""
    banners = db.query(BannerImage).order_by(BannerImage.display_order).all()
    return banners


@router.get("/carousel", response_model=List[CarouselBannerResponse])
def get_carousel_banners(db: Session = Depends(get_db)):
    """
    Get carousel banners for homepage.
    Returns merged list of:
    1. Manual banners (active)
    2. Events with is_highlight=True (auto-fetched)
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
            event_id=banner.event_id,
            image_position=banner.image_position
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
            # Use event's image_position if banner doesn't have its own
            if not item.image_position:
                item.image_position = banner.event.image_position

        carousel_items.append(item)

    # Get highlight events that don't already have a banner
    existing_event_ids = [b.event_id for b in manual_banners if b.event_id]
    highlight_events = db.query(Event).filter(
        Event.is_highlight == True,
        Event.status != 'Cancelled',
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
            event_signup_link=event.signup_link,
            image_position=event.image_position
        )
        carousel_items.append(item)

    # Sort by display_order
    carousel_items.sort(key=lambda x: x.display_order)

    return carousel_items


@router.get("/{banner_id}", response_model=BannerImageResponse)
def get_banner(banner_id: int, db: Session = Depends(get_db)):
    """Get a specific banner by ID"""
    banner = db.query(BannerImage).filter(BannerImage.id == banner_id).first()
    if not banner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found")
    return banner


@router.post("", response_model=BannerImageResponse)
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


@router.put("/{banner_id}", response_model=BannerImageResponse)
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


@router.delete("/{banner_id}")
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
