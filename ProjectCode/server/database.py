from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, Text, Index, Time, Date, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.types import DECIMAL
from sqlalchemy.dialects.mysql import LONGTEXT
import enum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, backref
from sqlalchemy.sql import func
import os
from dotenv import load_dotenv

load_dotenv()

# Database Configuration
USE_SQLITE = os.getenv("USE_SQLITE", "False").lower() == "true"

if USE_SQLITE:
    # SQLite for local development
    DATABASE_URL = "sqlite:///./newbee_running_club.db"
else:
    # AWS MySQL Database Configuration for newbee-running-club-db
    DB_HOST = os.getenv("DB_HOST")
    DB_PORT = os.getenv("DB_PORT", "3306")
    DB_USER = os.getenv("DB_USER", "admin")
    DB_PASSWORD = os.getenv("DB_PASSWORD")
    DB_NAME = os.getenv("DB_NAME", "newbee_running_club")

    # MySQL connection string for AWS RDS
    DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

if USE_SQLITE:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=os.getenv("DEBUG", "False").lower() == "true"
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=3600,  # Recycle connections after 1 hour
        echo=os.getenv("DEBUG", "False").lower() == "true"
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Donor Model for consolidated donor table
class Donor(Base):
    __tablename__ = "donors"

    donation_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    donor_id = Column(String(50), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    donor_type = Column(String(20), nullable=False)  # 'individual' or 'enterprise'
    donation_event = Column(String(255), default='General Support')
    amount = Column(DECIMAL(10, 2), nullable=False)
    quantity = Column(Integer, default=1)  # Number of donations
    donation_date = Column(Date)  # Date of donation
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Additional fields from original CSV data
    source = Column(String(255))
    receipt_confirmed = Column(Boolean, default=False)
    notes = Column(Text)
    message = Column(Text)  # Optional donor message to display publicly

    # Privacy and member linking fields
    member_id = Column(Integer, ForeignKey('members.id', ondelete='SET NULL'), nullable=True)
    hide_amount = Column(Boolean, default=False)  # User can choose to hide their donation amount
    hide_name = Column(Boolean, default=False)  # Admin can mark donor as anonymous

    # Indexes for better query performance
    __table_args__ = (
        Index('idx_donor_type', 'donor_type'),
        Index('idx_donation_event', 'donation_event'),
        Index('idx_amount', 'amount'),
        Index('idx_donation_date', 'donation_date'),
        Index('idx_created_at', 'created_at'),
        Index('idx_donor_member_id', 'member_id'),
    )

# Results Model for race results
class Results(Base):
    __tablename__ = "results"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    overall_place = Column(Integer)
    gender_place = Column(Integer)
    age_group_place = Column(Integer)
    bib = Column(String(20))
    name = Column(String(255), nullable=False)
    gender_age = Column(String(10))  # e.g., "M50"
    iaaf = Column(String(10))  # Country code like "CHN"
    overall_time = Column(String(20))  # Time format like "0:58:18"
    pace = Column(String(20))  # Pace format like "05:50"
    gun_time = Column(String(20))  # Gun time format like "0:58:28"
    age_graded_time = Column(String(20))  # Age graded time like "0:51:43"
    age_graded_place = Column(Integer)
    age_graded_percent = Column(DECIMAL(5, 2))  # Percentage like 85.09
    race = Column(String(255), nullable=False)  # Race name like "bronx 10 mile"
    race_time = Column(DateTime, nullable=False)  # Date and time of the race
    race_distance = Column(String(50), nullable=False)  # Race distance like "10 Mile"
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Indexes for better query performance
    __table_args__ = (
        Index('idx_race', 'race'),
        Index('idx_race_time', 'race_time'),
        Index('idx_name', 'name'),
        Index('idx_overall_place', 'overall_place'),
        Index('idx_gender_age', 'gender_age'),
    )


# Member status enum
class MemberStatus(enum.Enum):
    pending = "pending"       # New signups awaiting committee approval
    rejected = "rejected"     # Application denied (cannot log in, can be reconsidered)
    runner = "runner"         # Approved regular members
    committee = "committee"   # Committee members with elevated privileges (subset of admin)
    admin = "admin"           # Full admin with all privileges
    suspended = "suspended"   # Temporarily blocked (cannot log in)
    quit = "quit"             # Members who left the club (cannot log in)


# Member Model for club members
class Member(Base):
    __tablename__ = "members"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Authentication
    username = Column(String(50), nullable=False, unique=True)
    email = Column(String(255), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    firebase_uid = Column(String(128), unique=True)

    # Status & Role
    status = Column(String(30), nullable=False, default='pending')  # New signups default to pending
    status_reason = Column(String(500))  # Reason for rejection/suspension/etc.
    status_updated_at = Column(DateTime)  # When status was last changed
    status_updated_by = Column(String(100))  # Who changed the status (admin name)
    committee_position = Column(String(100))
    committee_position_cn = Column(String(100))

    # Profile
    first_name = Column(String(50))
    last_name = Column(String(50))
    display_name = Column(String(100))  # NYRR registered name (locked once set)
    display_name_cn = Column(String(100))
    nickname = Column(String(100))  # Freely changeable display name on website
    phone = Column(String(20))
    profile_photo_url = Column(String(500))
    gender = Column(String(1))  # "M" or "F" for race record matching
    birth_year = Column(Integer)  # e.g., 1985 for calculating gender_age

    # Club Data
    nyrr_member_id = Column(String(50))
    join_date = Column(Date)

    # Credits (for dashboard)
    registration_credits = Column(DECIMAL(10, 2), default=0)
    checkin_credits = Column(DECIMAL(10, 2), default=0)
    volunteer_credits = Column(DECIMAL(10, 2), default=0)
    activity_credits = Column(DECIMAL(10, 2), default=0)

    # Emergency Contact
    emergency_contact_name = Column(String(100))
    emergency_contact_phone = Column(String(20))

    # Application Data (from join form)
    running_experience = Column(Text)
    running_location = Column(String(255))
    weekly_frequency = Column(String(100))
    monthly_mileage = Column(String(100))
    race_experience = Column(Text)
    running_goals = Column(Text)
    introduction = Column(Text)

    # Privacy Settings (kill switches)
    show_in_credits = Column(Boolean, default=True)  # Show in club credit pages
    show_in_donors = Column(Boolean, default=True)   # Show in donor pages

    # Join activity tracking (for two-activity requirement)
    activities_completed = Column(Integer, default=0)  # 0, 1, or 2 offline activities

    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    activities = relationship(
        "MemberActivity",
        back_populates="member",
        cascade="all, delete-orphan",
        primaryjoin="Member.id == foreign(MemberActivity.member_id)"
    )
    donations = relationship("Donor", backref="member", foreign_keys="[Donor.member_id]")

    # Indexes for better query performance
    __table_args__ = (
        Index('idx_member_status', 'status'),
        Index('idx_member_nyrr_id', 'nyrr_member_id'),
        Index('idx_member_email', 'email'),
    )


# Activity Status enum for join workflow
class ActivityStatus(enum.Enum):
    pending = "pending"      # Submitted, awaiting verification
    verified = "verified"    # Admin verified the activity
    rejected = "rejected"    # Admin rejected the activity


# Member Activity Model for tracking offline runs during join process
class MemberActivity(Base):
    __tablename__ = "member_activities"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    member_id = Column(Integer, ForeignKey('members.id', ondelete='CASCADE'), nullable=False)
    activity_number = Column(Integer, nullable=False)  # 1 or 2 (first run, second run)

    # Activity details
    event_name = Column(String(255), nullable=False)
    event_date = Column(Date, nullable=False)
    description = Column(Text)
    proof_url = Column(String(500))  # Optional photo/screenshot URL

    # Verification
    status = Column(String(20), default='pending')  # 'pending', 'verified', 'rejected'
    verified_by = Column(Integer, ForeignKey('members.id', ondelete='SET NULL'))
    verified_at = Column(DateTime)
    rejection_reason = Column(String(255))

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    member = relationship("Member", back_populates="activities", foreign_keys=[member_id])
    verifier = relationship("Member", foreign_keys=[verified_by])

    __table_args__ = (
        Index('idx_activity_member_id', 'member_id'),
        Index('idx_activity_status', 'status'),
        UniqueConstraint('member_id', 'activity_number', name='uq_member_activity_number'),
    )


# Event Type enum
class EventType(enum.Enum):
    standard = "standard"  # Regular club events
    heylo = "heylo"        # Heylo-integrated events (weekly runs)
    race = "race"          # Race events


# Event Model for club events/activities
class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    chinese_name = Column(String(255))
    date = Column(Date, nullable=False)
    time = Column(String(50))  # Store as string like "8:00 AM"
    location = Column(String(255))
    chinese_location = Column(String(255))
    description = Column(Text)
    chinese_description = Column(Text)
    image = Column(String(500))
    image_position = Column(String(50), default='center center')  # CSS object-position value
    signup_link = Column(String(500))
    wechat_qr_code = Column(String(500))
    status = Column(String(50), default='Upcoming')  # 'Upcoming', 'Past', 'Cancelled' (lifecycle)
    is_highlight = Column(Boolean, default=False, nullable=False)  # Additive curation flag

    # Heylo integration fields
    event_type = Column(String(20), default='standard')  # 'standard', 'heylo', 'race'
    heylo_embed = Column(Text)  # Stores Heylo embed code snippet for heylo event type

    # Event group fields (for iOS-style folder grouping)
    group_name = Column(String(255))      # Auto-detected common name (e.g., "Brooklyn Half Marathon")
    group_name_cn = Column(String(255))   # Chinese version

    # Recurrence fields (repurposed for group mechanism)
    is_recurring = Column(Boolean, default=False)
    parent_event_id = Column(Integer, ForeignKey('events.id', ondelete='SET NULL'))
    next_occurrence_date = Column(Date)  # For scheduler efficiency

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Self-referential relationship for recurring instances
    parent_event = relationship("Event", remote_side="Event.id", backref="recurring_instances")

    # Indexes for better query performance
    __table_args__ = (
        Index('idx_event_status', 'status'),
        Index('idx_event_date', 'date'),
        Index('idx_event_type', 'event_type'),
        Index('idx_event_is_recurring', 'is_recurring'),
        Index('idx_event_parent_id', 'parent_event_id'),
        Index('idx_event_group_name', 'group_name'),
        Index('idx_event_is_highlight', 'is_highlight'),
    )


# Meeting Minutes Model for committee meeting records
class MeetingMinutes(Base):
    __tablename__ = "meeting_minutes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    meeting_date = Column(Date, nullable=False)
    content = Column(Text, nullable=False)  # HTML content from rich text editor
    created_by = Column(String(100))  # Name of admin who created
    created_by_id = Column(Integer)  # Member ID of creator
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Indexes for better query performance
    __table_args__ = (
        Index('idx_meeting_date', 'meeting_date'),
        Index('idx_meeting_created_at', 'created_at'),
    )


# Comment Model for event comments
class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey('events.id', ondelete='CASCADE'), nullable=False)
    member_id = Column(Integer, ForeignKey('members.id', ondelete='CASCADE'), nullable=False)
    firebase_uid = Column(String(128), nullable=False)
    content = Column(Text, nullable=False)
    author_name = Column(String(100))
    author_photo_url = Column(String(500))

    # Moderation fields
    is_highlighted = Column(Boolean, default=False)
    is_hidden = Column(Boolean, default=False)
    hidden_by = Column(Integer, ForeignKey('members.id', ondelete='SET NULL'))
    hidden_at = Column(DateTime)
    hidden_reason = Column(String(255))

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    event = relationship("Event", backref="comments")
    member = relationship("Member", foreign_keys=[member_id], backref="comments")
    hidden_by_member = relationship("Member", foreign_keys=[hidden_by])

    __table_args__ = (
        Index('idx_comment_event_id', 'event_id'),
        Index('idx_comment_member_id', 'member_id'),
        Index('idx_comment_created_at', 'created_at'),
    )


# Like Model for event likes
class Like(Base):
    __tablename__ = "likes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey('events.id', ondelete='CASCADE'), nullable=False)
    member_id = Column(Integer, ForeignKey('members.id', ondelete='CASCADE'), nullable=True)  # Nullable for anonymous
    firebase_uid = Column(String(128))  # Nullable for anonymous
    anonymous_id = Column(String(128))  # For non-logged-in users (stored in localStorage)
    created_at = Column(DateTime, default=func.now())

    # Relationships
    event = relationship("Event", backref="likes")
    member = relationship("Member", backref="likes")

    __table_args__ = (
        Index('idx_like_event_id', 'event_id'),
        UniqueConstraint('event_id', 'member_id', name='uq_like_event_member'),
        UniqueConstraint('event_id', 'anonymous_id', name='uq_like_event_anonymous'),
    )


# Reaction Model for event emoji reactions
class Reaction(Base):
    __tablename__ = "reactions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey('events.id', ondelete='CASCADE'), nullable=False)
    member_id = Column(Integer, ForeignKey('members.id', ondelete='CASCADE'), nullable=True)  # Nullable for anonymous
    firebase_uid = Column(String(128))  # Nullable for anonymous
    anonymous_id = Column(String(128))  # For non-logged-in users
    emoji = Column(String(10), nullable=False)  # Store emoji character
    created_at = Column(DateTime, default=func.now())

    # Relationships
    event = relationship("Event", backref="reactions")
    member = relationship("Member", backref="reactions")

    __table_args__ = (
        Index('idx_reaction_event_id', 'event_id'),
        Index('idx_reaction_emoji', 'emoji'),
        UniqueConstraint('event_id', 'member_id', 'emoji', name='uq_reaction_event_member_emoji'),
        UniqueConstraint('event_id', 'anonymous_id', 'emoji', name='uq_reaction_event_anonymous_emoji'),
    )


# EventCommentSettings Model for per-event engagement settings
class EventCommentSettings(Base):
    __tablename__ = "event_comment_settings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey('events.id', ondelete='CASCADE'), nullable=False, unique=True)

    comments_enabled = Column(Boolean, default=True)
    likes_enabled = Column(Boolean, default=True)
    reactions_enabled = Column(Boolean, default=True)

    closed_at = Column(DateTime)
    closed_by = Column(Integer, ForeignKey('members.id', ondelete='SET NULL'))
    closed_reason = Column(String(255))

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    event = relationship("Event", backref="comment_settings")
    closed_by_member = relationship("Member")

    __table_args__ = (
        Index('idx_event_comment_settings_event_id', 'event_id'),
    )


# TempClubCredit Model for storing credits for people who haven't registered as members yet
class TempClubCredit(Base):
    __tablename__ = "temp_club_credits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    full_name = Column(String(255), nullable=False, index=True)
    credit_type = Column(String(50), nullable=False)  # 'total', 'activity', 'registration', 'volunteer'
    registration_credits = Column(DECIMAL(10, 2), default=0)
    checkin_credits = Column(DECIMAL(10, 2), default=0)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Indexes for better query performance
    __table_args__ = (
        Index('idx_temp_credit_full_name', 'full_name'),
        Index('idx_temp_credit_type', 'credit_type'),
    )


# BannerImage Model for homepage carousel banners
class BannerImage(Base):
    __tablename__ = "banner_images"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    image_url = Column(String(500), nullable=False)
    alt_text = Column(String(255))
    link_path = Column(String(255))  # Internal path like '/about'
    label_en = Column(String(100))  # English label
    label_cn = Column(String(100))  # Chinese label
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    event_id = Column(Integer, ForeignKey('events.id', ondelete='SET NULL'), nullable=True)  # Link to event
    source_type = Column(String(20), default='manual')  # 'manual' or 'event_highlight'
    image_position = Column(String(50), default='center center')  # CSS object-position value
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationship
    event = relationship("Event", backref="banners")

    __table_args__ = (
        Index('idx_banner_display_order', 'display_order'),
        Index('idx_banner_is_active', 'is_active'),
    )


# HomepageSection Model for admin-editable homepage sections
class HomepageSection(Base):
    __tablename__ = "homepage_sections"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title_en = Column(String(100), nullable=False)
    title_cn = Column(String(100))
    image_url = Column(Text)  # Use Text to support base64 data URLs
    image_position = Column(String(50), default='center center')  # CSS object-position value
    link_path = Column(String(255), nullable=False)
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('idx_section_display_order', 'display_order'),
        Index('idx_section_is_active', 'is_active'),
    )


# TrainingTip Model for community training tips
class TrainingTip(Base):
    __tablename__ = "training_tips"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    category = Column(String(50), nullable=False)  # 'recovery', 'nutrition', 'technique', 'mental', 'gear'
    title = Column(String(255), nullable=False)
    title_cn = Column(String(255))  # Chinese title
    content = Column(Text, nullable=False)
    content_cn = Column(Text)  # Chinese content
    video_url = Column(String(500))  # YouTube or Bilibili URL
    video_platform = Column(String(20))  # 'youtube' or 'bilibili'
    author_name = Column(String(100))
    author_id = Column(Integer, ForeignKey('members.id', ondelete='SET NULL'))
    upvotes = Column(Integer, default=0)
    status = Column(String(20), default='pending')  # 'pending', 'approved', 'rejected'
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationship
    author = relationship("Member", backref="training_tips")

    __table_args__ = (
        Index('idx_tip_category', 'category'),
        Index('idx_tip_status', 'status'),
        Index('idx_tip_upvotes', 'upvotes'),
    )


# TrainingTipUpvote Model to track who upvoted what
class TrainingTipUpvote(Base):
    __tablename__ = "training_tip_upvotes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    tip_id = Column(Integer, ForeignKey('training_tips.id', ondelete='CASCADE'), nullable=False)
    member_id = Column(Integer, ForeignKey('members.id', ondelete='CASCADE'), nullable=True)
    anonymous_id = Column(String(128))  # For non-logged-in users
    created_at = Column(DateTime, default=func.now())

    # Relationships
    tip = relationship("TrainingTip", backref="upvote_records")
    member = relationship("Member", backref="tip_upvotes")

    __table_args__ = (
        Index('idx_upvote_tip_id', 'tip_id'),
        UniqueConstraint('tip_id', 'member_id', name='uq_upvote_tip_member'),
        UniqueConstraint('tip_id', 'anonymous_id', name='uq_upvote_tip_anonymous'),
    )


# Event Gallery Image Model for event photo galleries
class EventGalleryImage(Base):
    __tablename__ = "event_gallery_images"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey('events.id', ondelete='CASCADE'), nullable=False)
    image_url = Column(Text().with_variant(LONGTEXT(), 'mysql'), nullable=False)  # Base64 data URL - LONGTEXT for MySQL (up to 4GB)
    caption = Column(String(500))
    caption_cn = Column(String(500))
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    uploaded_by_id = Column(Integer, ForeignKey('members.id', ondelete='SET NULL'))
    uploaded_by_name = Column(String(100))
    like_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    event = relationship("Event", backref="gallery_images")
    uploaded_by = relationship("Member", backref="uploaded_gallery_images")

    __table_args__ = (
        Index('idx_gallery_event_id', 'event_id'),
        Index('idx_gallery_display_order', 'display_order'),
        Index('idx_gallery_is_active', 'is_active'),
    )


# Event Gallery Image Like Model for tracking likes on gallery images
class EventGalleryImageLike(Base):
    __tablename__ = "event_gallery_image_likes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    image_id = Column(Integer, ForeignKey('event_gallery_images.id', ondelete='CASCADE'), nullable=False)
    member_id = Column(Integer, ForeignKey('members.id', ondelete='CASCADE'), nullable=True)
    firebase_uid = Column(String(128))
    anonymous_id = Column(String(128))  # For non-logged-in users
    created_at = Column(DateTime, default=func.now())

    # Relationships
    # cascade delete-orphan so ORM-level image deletion removes likes
    # (image_id is NOT NULL, so the default null-out behavior would fail)
    image = relationship("EventGalleryImage", backref=backref("likes", cascade="all, delete-orphan"))
    member = relationship("Member", backref="gallery_image_likes")

    __table_args__ = (
        Index('idx_gallery_like_image_id', 'image_id'),
        UniqueConstraint('image_id', 'member_id', name='uq_gallery_like_image_member'),
        UniqueConstraint('image_id', 'anonymous_id', name='uq_gallery_like_image_anonymous'),
    )


# Gallery Deletion Request Model for moderated image deletion
class GalleryDeletionRequest(Base):
    __tablename__ = "gallery_deletion_requests"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    image_id = Column(Integer, ForeignKey('event_gallery_images.id', ondelete='CASCADE'), nullable=False)
    requested_by_id = Column(Integer, ForeignKey('members.id', ondelete='CASCADE'), nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String(20), default='pending')  # 'pending', 'approved', 'rejected'
    resolved_by_id = Column(Integer, ForeignKey('members.id', ondelete='SET NULL'))
    resolved_at = Column(DateTime)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    # cascade delete-orphan so ORM-level image deletion removes its requests
    # (image_id is NOT NULL, so the default null-out behavior would fail)
    image = relationship("EventGalleryImage", backref=backref("deletion_requests", cascade="all, delete-orphan"))
    requested_by = relationship("Member", foreign_keys=[requested_by_id])
    resolved_by = relationship("Member", foreign_keys=[resolved_by_id])

    __table_args__ = (
        Index('idx_deletion_req_image_id', 'image_id'),
        Index('idx_deletion_req_status', 'status'),
    )


# Event Recurrence Rule Model for recurring events
class EventRecurrenceRule(Base):
    __tablename__ = "event_recurrence_rules"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey('events.id', ondelete='CASCADE'), unique=True, nullable=False)
    recurrence_type = Column(String(50), nullable=False)  # 'weekly', 'biweekly', 'monthly', 'yearly', 'custom'
    # weekly/biweekly: which days (0=Sun, 1=Mon, ..., 6=Sat)
    days_of_week = Column(String(50))  # "0,1,2" for Sun,Mon,Tue
    # monthly: which day/week
    day_of_month = Column(Integer)  # 1-31, or null for week-based
    week_of_month = Column(Integer)  # 1-5 (5 = last)
    # yearly: month + day or month + week + weekday
    month_of_year = Column(Integer)  # 1-12
    # custom patterns
    custom_rule = Column(Text)  # JSON for complex rules
    # limits
    end_date = Column(Date)
    max_occurrences = Column(Integer)
    occurrences_created = Column(Integer, default=0)
    # tracking
    last_generated_date = Column(Date)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationship
    event = relationship("Event", backref="recurrence_rule")

    __table_args__ = (
        Index('idx_recurrence_event_id', 'event_id'),
        Index('idx_recurrence_type', 'recurrence_type'),
        Index('idx_recurrence_is_active', 'is_active'),
    )


# Site Settings Model for configurable settings (social links, etc.)
class SiteSetting(Base):
    __tablename__ = "site_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), nullable=False, unique=True, index=True)
    value = Column(String(500))
    label_en = Column(String(100))
    label_cn = Column(String(100))
    category = Column(String(50), default='social')
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('idx_setting_key', 'key'),
        Index('idx_setting_category', 'category'),
    )


# Database dependency for FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Create all tables
def create_tables():
    Base.metadata.create_all(bind=engine)