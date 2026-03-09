"""Authentication dependency functions for FastAPI endpoints."""
from fastapi import Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db, Member


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
