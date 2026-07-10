"""Homepage sections endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db, HomepageSection, Member
from models import HomepageSectionCreate, HomepageSectionUpdate, HomepageSectionResponse, SectionReorderRequest
from utils.auth import get_current_admin, get_current_committee_or_admin

router = APIRouter(prefix="/api/homepage-sections", tags=["homepage"])


@router.get("", response_model=List[HomepageSectionResponse])
def get_active_sections(db: Session = Depends(get_db)):
    """Get all active homepage sections, sorted by display order"""
    sections = db.query(HomepageSection).filter(
        HomepageSection.is_active == True
    ).order_by(HomepageSection.display_order).all()
    return sections


@router.get("/all", response_model=List[HomepageSectionResponse])
def get_all_sections(
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Get all homepage sections including inactive ones (admin only)"""
    sections = db.query(HomepageSection).order_by(HomepageSection.display_order).all()
    return sections


@router.put("/reorder")
def reorder_sections(
    request: SectionReorderRequest,
    db: Session = Depends(get_db),
    current_admin: Member = Depends(get_current_admin)
):
    """Reorder homepage sections (admin only).

    NOTE: must be registered before the /{section_id} routes, otherwise
    PUT /reorder is captured by PUT /{section_id} and fails with 422.
    """
    for index, section_id in enumerate(request.section_ids):
        section = db.query(HomepageSection).filter(HomepageSection.id == section_id).first()
        if section:
            section.display_order = index

    db.commit()
    return {"message": "Sections reordered successfully"}


@router.get("/{section_id}", response_model=HomepageSectionResponse)
def get_section(section_id: int, db: Session = Depends(get_db)):
    """Get a specific homepage section by ID"""
    section = db.query(HomepageSection).filter(HomepageSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    return section


@router.post("", response_model=HomepageSectionResponse)
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


@router.put("/{section_id}", response_model=HomepageSectionResponse)
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


@router.delete("/{section_id}")
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
