"""Site settings endpoints for managing social links and other configuration."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db, Member, SiteSetting
from models import (
    SiteSettingCreate, SiteSettingUpdate, SiteSettingResponse,
    SocialLinksResponse
)
from utils.auth import get_current_admin, get_current_committee_or_admin

router = APIRouter(tags=["Site Settings"])


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


@router.get("/api/settings/social-links", response_model=SocialLinksResponse)
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


@router.get("/api/settings", response_model=List[SiteSettingResponse])
def get_all_settings(
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """Get all site settings (admin/committee only)."""
    return db.query(SiteSetting).order_by(SiteSetting.category, SiteSetting.key).all()


@router.get("/api/settings/category/{category}", response_model=List[SiteSettingResponse])
def get_settings_by_category(
    category: str,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """Get settings by category (admin/committee only)."""
    return db.query(SiteSetting).filter(SiteSetting.category == category).all()


@router.put("/api/settings/{key}", response_model=SiteSettingResponse)
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


@router.post("/api/settings", response_model=SiteSettingResponse)
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
