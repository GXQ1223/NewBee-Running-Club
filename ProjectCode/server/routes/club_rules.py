"""Club rule version endpoints (yearly Club Entry rules, editable by committee)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db, ClubRuleVersion, Member
from models import ClubRuleVersionCreate, ClubRuleVersionUpdate, ClubRuleVersionResponse
from utils.auth import get_current_committee_or_admin

router = APIRouter(prefix="/api/club-rules", tags=["club-rules"])


def _unset_other_currents(db: Session, keep_id=None):
    """Ensure only one version is marked current."""
    query = db.query(ClubRuleVersion).filter(ClubRuleVersion.is_current == True)  # noqa: E712
    if keep_id is not None:
        query = query.filter(ClubRuleVersion.id != keep_id)
    for version in query.all():
        version.is_current = False


@router.get("", response_model=List[ClubRuleVersionResponse])
def get_all_rule_versions(db: Session = Depends(get_db)):
    """Get all rule versions: current first, then newest year first (public)."""
    return db.query(ClubRuleVersion).order_by(
        ClubRuleVersion.is_current.desc(),
        ClubRuleVersion.year_label.desc(),
    ).all()


@router.post("", response_model=ClubRuleVersionResponse)
def create_rule_version(
    version: ClubRuleVersionCreate,
    db: Session = Depends(get_db),
    current_member: Member = Depends(get_current_committee_or_admin),
):
    """Create a new rule version (committee/admin). New current archives the others."""
    data = version.model_dump()
    data['created_by'] = current_member.display_name or current_member.username
    data['created_by_id'] = current_member.id

    db_version = ClubRuleVersion(**data)
    if db_version.is_current:
        _unset_other_currents(db)
    db.add(db_version)
    db.commit()
    db.refresh(db_version)
    return db_version


@router.put("/{version_id}", response_model=ClubRuleVersionResponse)
def update_rule_version(
    version_id: int,
    version_update: ClubRuleVersionUpdate,
    db: Session = Depends(get_db),
    current_member: Member = Depends(get_current_committee_or_admin),
):
    """Update a rule version (committee/admin)."""
    db_version = db.query(ClubRuleVersion).filter(ClubRuleVersion.id == version_id).first()
    if not db_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rule version with ID {version_id} not found",
        )

    update_data = version_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_version, field, value)

    if update_data.get('is_current'):
        _unset_other_currents(db, keep_id=version_id)

    db.commit()
    db.refresh(db_version)
    return db_version


@router.delete("/{version_id}")
def delete_rule_version(
    version_id: int,
    db: Session = Depends(get_db),
    current_member: Member = Depends(get_current_committee_or_admin),
):
    """Delete a rule version (committee/admin)."""
    db_version = db.query(ClubRuleVersion).filter(ClubRuleVersion.id == version_id).first()
    if not db_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rule version with ID {version_id} not found",
        )
    db.delete(db_version)
    db.commit()
    return {"message": "Rule version deleted successfully"}
