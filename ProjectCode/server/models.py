from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict
from decimal import Decimal
import datetime as dt
from datetime import datetime
from enum import Enum

class DonorType(str, Enum):
    individual = "individual"
    enterprise = "enterprise"

class DonorBase(BaseModel):
    donor_id: str = Field(..., max_length=50)
    name: str = Field(..., max_length=255)
    donor_type: DonorType
    donation_event: str = Field(default="General Support", max_length=255)
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    quantity: int = Field(default=1, ge=1)
    donation_date: Optional[dt.date] = None
    source: Optional[str] = Field(None, max_length=255)
    receipt_confirmed: bool = Field(default=False)
    notes: Optional[str] = None
    message: Optional[str] = None  # Public message from donor
    member_id: Optional[int] = None  # Link to member account for privacy control
    hide_amount: bool = Field(default=False)  # User can hide their donation amount
    hide_name: bool = Field(default=False)  # Admin can mark donor as anonymous

class DonorCreate(DonorBase):
    pass

class DonorUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    donation_event: Optional[str] = Field(None, max_length=255)
    amount: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    quantity: Optional[int] = Field(None, ge=1)
    donation_date: Optional[dt.date] = None
    source: Optional[str] = Field(None, max_length=255)
    receipt_confirmed: Optional[bool] = None
    notes: Optional[str] = None
    message: Optional[str] = None
    member_id: Optional[int] = None
    hide_amount: Optional[bool] = None
    hide_name: Optional[bool] = None

class DonorResponse(DonorBase):
    donation_id: int
    member_id: Optional[int] = None
    hide_amount: bool = False
    hide_name: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DonorPublicResponse(BaseModel):
    """Public donor response with privacy rules applied"""
    donation_id: int
    donor_id: str
    name: str
    donor_type: DonorType
    donation_event: str
    amount: Optional[Decimal] = None  # Hidden for individual donors
    quantity: int = 1
    donation_date: Optional[dt.date] = None
    message: Optional[str] = None

    class Config:
        from_attributes = True


class DonorLinkMemberRequest(BaseModel):
    """Request to link a donor to a member account"""
    member_id: int

class DonorsListResponse(BaseModel):
    individual_donors: list[DonorResponse]
    enterprise_donors: list[DonorResponse]
    
class DonationSummary(BaseModel):
    donor_type: str
    donor_count: int
    total_amount: Decimal
    average_amount: Decimal
    min_amount: Decimal
    max_amount: Decimal


# Member Status Enum
class MemberStatus(str, Enum):
    pending = "pending"  # New signups awaiting committee approval
    runner = "runner"     # Approved regular members
    committee = "committee"  # Committee members with elevated privileges (subset of admin)
    admin = "admin"       # Full admin with all privileges
    quit = "quit"         # Members who left the club
    rejected = "rejected"  # Rejected applicants
    suspended = "suspended"  # Suspended members


# Member Schemas
class MemberBase(BaseModel):
    username: str = Field(..., max_length=50)
    email: str = Field(..., max_length=255)
    status: MemberStatus = Field(default=MemberStatus.pending)
    committee_position: Optional[str] = Field(None, max_length=100)
    committee_position_cn: Optional[str] = Field(None, max_length=100)
    first_name: Optional[str] = Field(None, max_length=50)
    last_name: Optional[str] = Field(None, max_length=50)
    display_name: Optional[str] = Field(None, max_length=100)
    display_name_cn: Optional[str] = Field(None, max_length=100)
    nickname: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    profile_photo_url: Optional[str] = Field(None, max_length=500)
    gender: Optional[str] = Field(None, max_length=1)  # "M" or "F"
    birth_year: Optional[int] = Field(None, ge=1900, le=2020)
    nyrr_member_id: Optional[str] = Field(None, max_length=50)
    join_date: Optional[dt.date] = None
    emergency_contact_name: Optional[str] = Field(None, max_length=100)
    emergency_contact_phone: Optional[str] = Field(None, max_length=20)
    show_in_credits: bool = Field(default=True)
    show_in_donors: bool = Field(default=True)
    # Application form data
    running_experience: Optional[str] = None
    running_location: Optional[str] = Field(None, max_length=255)
    weekly_frequency: Optional[str] = Field(None, max_length=100)
    monthly_mileage: Optional[str] = Field(None, max_length=100)
    race_experience: Optional[str] = None
    running_goals: Optional[str] = None
    introduction: Optional[str] = None
    # Join activity tracking
    activities_completed: int = Field(default=0, ge=0, le=2)


class MemberCreate(MemberBase):
    password: str = Field(..., min_length=8)
    firebase_uid: Optional[str] = Field(None, max_length=128)


class MemberUpdate(BaseModel):
    email: Optional[str] = Field(None, max_length=255)
    status: Optional[MemberStatus] = None
    committee_position: Optional[str] = Field(None, max_length=100)
    committee_position_cn: Optional[str] = Field(None, max_length=100)
    first_name: Optional[str] = Field(None, max_length=50)
    last_name: Optional[str] = Field(None, max_length=50)
    display_name: Optional[str] = Field(None, max_length=100)
    display_name_cn: Optional[str] = Field(None, max_length=100)
    nickname: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    profile_photo_url: Optional[str] = Field(None, max_length=500)
    gender: Optional[str] = Field(None, max_length=1)  # "M" or "F"
    birth_year: Optional[int] = Field(None, ge=1900, le=2020)
    nyrr_member_id: Optional[str] = Field(None, max_length=50)
    join_date: Optional[dt.date] = None
    registration_credits: Optional[Decimal] = None
    checkin_credits: Optional[Decimal] = None
    volunteer_credits: Optional[Decimal] = None
    activity_credits: Optional[Decimal] = None
    emergency_contact_name: Optional[str] = Field(None, max_length=100)
    emergency_contact_phone: Optional[str] = Field(None, max_length=20)
    show_in_credits: Optional[bool] = None
    show_in_donors: Optional[bool] = None
    # Application form data
    running_experience: Optional[str] = None
    running_location: Optional[str] = Field(None, max_length=255)
    weekly_frequency: Optional[str] = Field(None, max_length=100)
    monthly_mileage: Optional[str] = Field(None, max_length=100)
    race_experience: Optional[str] = None
    running_goals: Optional[str] = None
    introduction: Optional[str] = None
    # Join activity tracking
    activities_completed: Optional[int] = None


class MemberResponse(MemberBase):
    id: int
    firebase_uid: Optional[str] = None
    registration_credits: Decimal = Decimal("0")
    checkin_credits: Decimal = Decimal("0")
    volunteer_credits: Decimal = Decimal("0")
    activity_credits: Decimal = Decimal("0")
    activities_completed: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MemberPublicResponse(BaseModel):
    """Public member info (no sensitive data)"""
    id: int
    username: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    display_name_cn: Optional[str] = None
    nickname: Optional[str] = None
    status: MemberStatus
    committee_position: Optional[str] = None
    committee_position_cn: Optional[str] = None
    profile_photo_url: Optional[str] = None
    registration_credits: Decimal = Decimal("0")
    checkin_credits: Decimal = Decimal("0")
    volunteer_credits: Decimal = Decimal("0")
    activity_credits: Decimal = Decimal("0")

    class Config:
        from_attributes = True


class FirebaseUserSync(BaseModel):
    """Sync Firebase user to members table"""
    firebase_uid: str = Field(..., max_length=128)
    email: str = Field(..., max_length=255)
    display_name: Optional[str] = Field(None, max_length=100)
    photo_url: Optional[str] = Field(None, max_length=500)


class JoinApplicationRequest(BaseModel):
    """Join application form submission"""
    first_name: str = Field(..., max_length=50)
    last_name: str = Field(..., max_length=50)
    nickname: Optional[str] = Field(None, max_length=100)
    email: str = Field(..., max_length=255)
    nyrr_id: Optional[str] = Field(None, max_length=50)
    running_experience: str
    location: str
    weekly_frequency: str
    monthly_mileage: str
    race_experience: Optional[str] = None
    goals: str
    introduction: str


class ExistingMemberAccountRequest(BaseModel):
    """Request from an existing club member to create a website account"""
    name: str = Field(..., max_length=100)
    email: str = Field(..., max_length=255)


# Activity Status Enum for join workflow
class ActivityStatus(str, Enum):
    pending = "pending"
    verified = "verified"
    rejected = "rejected"


# Member Activity Schemas (for two offline activities requirement)
class MemberActivityBase(BaseModel):
    activity_number: int = Field(..., ge=1, le=2)  # 1 or 2
    event_name: str = Field(..., max_length=255)
    event_date: dt.date
    description: Optional[str] = None
    proof_url: Optional[str] = Field(None, max_length=500)


class MemberActivityCreate(MemberActivityBase):
    pass


class MemberActivityUpdate(BaseModel):
    event_name: Optional[str] = Field(None, max_length=255)
    event_date: Optional[dt.date] = None
    description: Optional[str] = None
    proof_url: Optional[str] = Field(None, max_length=500)


class MemberActivityResponse(MemberActivityBase):
    id: int
    member_id: int
    status: ActivityStatus = ActivityStatus.pending
    verified_by: Optional[int] = None
    verified_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ActivityVerifyRequest(BaseModel):
    """Request to verify or reject an activity"""
    approved: bool
    rejection_reason: Optional[str] = Field(None, max_length=255)


class JoinApplicationWithActivities(JoinApplicationRequest):
    """Join application with optional activity records"""
    activities: Optional[List[MemberActivityCreate]] = None


# Event Status Enum (lifecycle state)
# 'Highlight' is kept for backwards compatibility with old API clients but is
# treated identically to 'Past' (legacy data is migrated to status='Past',
# is_highlight=True). New writes should use 'Past'.
class EventStatus(str, Enum):
    upcoming = "Upcoming"
    past = "Past"
    highlight = "Highlight"  # legacy alias for 'Past'
    cancelled = "Cancelled"


# Event Type Enum (for Heylo integration)
class EventType(str, Enum):
    standard = "standard"  # Regular club events
    heylo = "heylo"        # Heylo-integrated events (weekly runs)
    race = "race"          # Race events
    general = "general"    # General events


# Event Schemas
class EventBase(BaseModel):
    name: str = Field(..., max_length=255)
    chinese_name: Optional[str] = Field(None, max_length=255)
    date: dt.date
    time: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=255)
    chinese_location: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    chinese_description: Optional[str] = None
    image: Optional[str] = None
    image_position: Optional[str] = Field(None, max_length=50)
    signup_link: Optional[str] = Field(None, max_length=500)
    wechat_qr_code: Optional[str] = Field(None, max_length=500)
    status: EventStatus = Field(default=EventStatus.upcoming)
    event_type: EventType = Field(default=EventType.standard)
    heylo_embed: Optional[str] = None  # Heylo embed code for heylo event type
    is_highlight: bool = Field(default=False)  # Additive curation flag


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    chinese_name: Optional[str] = Field(None, max_length=255)
    date: Optional[dt.date] = None
    time: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=255)
    chinese_location: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    chinese_description: Optional[str] = None
    image: Optional[str] = None
    image_position: Optional[str] = Field(None, max_length=50)
    signup_link: Optional[str] = Field(None, max_length=500)
    wechat_qr_code: Optional[str] = Field(None, max_length=500)
    status: Optional[EventStatus] = None
    event_type: Optional[EventType] = None
    heylo_embed: Optional[str] = None
    is_highlight: Optional[bool] = None
    # Recurrence fields
    is_recurring: Optional[bool] = None


class EventResponse(EventBase):
    id: int
    event_type: str = "standard"
    heylo_embed: Optional[str] = None
    image_position: Optional[str] = None
    is_highlight: bool = False
    # Event group fields
    group_name: Optional[str] = None
    group_name_cn: Optional[str] = None
    # Recurrence/group fields
    is_recurring: bool = False
    parent_event_id: Optional[int] = None
    next_occurrence_date: Optional[dt.date] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Meeting Minutes Schemas
class MeetingMinutesBase(BaseModel):
    title: str = Field(..., max_length=255)
    meeting_date: dt.date
    content: str  # HTML content from rich text editor


class MeetingMinutesCreate(MeetingMinutesBase):
    pass


class MeetingMinutesUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    meeting_date: Optional[dt.date] = None
    content: Optional[str] = None


class MeetingMinutesResponse(MeetingMinutesBase):
    id: int
    created_by: Optional[str] = None
    created_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Club Rule Version Schemas (yearly Club Entry rules revisions)
class ClubRuleVersionBase(BaseModel):
    year_label: str = Field(..., max_length=50)
    title: str = Field(..., max_length=255)
    content: str  # HTML content from rich text editor
    is_current: bool = True


class ClubRuleVersionCreate(ClubRuleVersionBase):
    pass


class ClubRuleVersionUpdate(BaseModel):
    year_label: Optional[str] = Field(None, max_length=50)
    title: Optional[str] = Field(None, max_length=255)
    content: Optional[str] = None
    is_current: Optional[bool] = None


class ClubRuleVersionResponse(ClubRuleVersionBase):
    id: int
    created_by: Optional[str] = None
    created_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Comment Schemas
class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class CommentResponse(BaseModel):
    id: int
    event_id: int
    member_id: int
    content: str
    author_name: Optional[str] = None
    author_photo_url: Optional[str] = None
    is_highlighted: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CommentWithModeration(CommentResponse):
    """Comment response with moderation fields (for admin view)"""
    is_hidden: bool = False
    hidden_by: Optional[int] = None
    hidden_at: Optional[datetime] = None
    hidden_reason: Optional[str] = None


class CommentHideRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=255)


# Like Schemas
class LikeCreate(BaseModel):
    anonymous_id: Optional[str] = Field(None, max_length=128)


class LikeResponse(BaseModel):
    id: int
    event_id: int
    member_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class LikeCountResponse(BaseModel):
    count: int
    user_liked: bool


# Reaction Schemas
ALLOWED_EMOJIS = ["🏃", "🎉", "💪", "👏", "❤️", "🔥", "🐝", "⭐"]


class ReactionCreate(BaseModel):
    emoji: str = Field(..., max_length=10)
    anonymous_id: Optional[str] = Field(None, max_length=128)


class ReactionCountResponse(BaseModel):
    emoji: str
    count: int
    user_reacted: bool


class EventReactionsResponse(BaseModel):
    reactions: List[ReactionCountResponse]


# Event Comment Settings Schemas
class EventCommentSettingsUpdate(BaseModel):
    comments_enabled: Optional[bool] = None
    likes_enabled: Optional[bool] = None
    reactions_enabled: Optional[bool] = None
    closed_reason: Optional[str] = Field(None, max_length=255)


class EventCommentSettingsResponse(BaseModel):
    id: int
    event_id: int
    comments_enabled: bool = True
    likes_enabled: bool = True
    reactions_enabled: bool = True
    closed_at: Optional[datetime] = None
    closed_by: Optional[int] = None
    closed_reason: Optional[str] = None

    class Config:
        from_attributes = True


# Aggregated Engagement Response
class EventEngagementResponse(BaseModel):
    event_id: int
    likes: LikeCountResponse
    reactions: List[ReactionCountResponse]
    comment_count: int
    comments_enabled: bool = True
    likes_enabled: bool = True
    reactions_enabled: bool = True


class BatchEngagementRequest(BaseModel):
    event_ids: List[int]
    anonymous_id: Optional[str] = None


class BatchEngagementResponse(BaseModel):
    engagements: Dict[int, EventEngagementResponse]


# Temp Club Credit Schemas
class CreditType(str, Enum):
    total = "total"
    activity = "activity"
    registration = "registration"
    volunteer = "volunteer"


class TempClubCreditBase(BaseModel):
    full_name: str = Field(..., max_length=255)
    credit_type: CreditType
    registration_credits: Decimal = Field(default=Decimal("0"), decimal_places=2)
    checkin_credits: Decimal = Field(default=Decimal("0"), decimal_places=2)


class TempClubCreditCreate(TempClubCreditBase):
    pass


class TempClubCreditUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=255)
    credit_type: Optional[CreditType] = None
    registration_credits: Optional[Decimal] = Field(None, decimal_places=2)
    checkin_credits: Optional[Decimal] = Field(None, decimal_places=2)


class TempClubCreditResponse(TempClubCreditBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Banner Image Schemas
class BannerImageBase(BaseModel):
    image_url: str = Field(..., max_length=500)
    alt_text: Optional[str] = Field(None, max_length=255)
    link_path: Optional[str] = Field(None, max_length=255)
    label_en: Optional[str] = Field(None, max_length=100)
    label_cn: Optional[str] = Field(None, max_length=100)
    display_order: int = Field(default=0)
    is_active: bool = Field(default=True)
    event_id: Optional[int] = None
    source_type: str = Field(default='manual', max_length=20)
    image_position: Optional[str] = Field(None, max_length=50)


class BannerImageCreate(BannerImageBase):
    pass


class BannerImageUpdate(BaseModel):
    image_url: Optional[str] = Field(None, max_length=500)
    alt_text: Optional[str] = Field(None, max_length=255)
    link_path: Optional[str] = Field(None, max_length=255)
    label_en: Optional[str] = Field(None, max_length=100)
    label_cn: Optional[str] = Field(None, max_length=100)
    display_order: Optional[int] = None
    is_active: Optional[bool] = None
    event_id: Optional[int] = None
    source_type: Optional[str] = Field(None, max_length=20)
    image_position: Optional[str] = Field(None, max_length=50)


class BannerImageResponse(BannerImageBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Carousel Banner Response (includes event data if linked)
class CarouselBannerResponse(BaseModel):
    id: int
    image_url: str
    alt_text: Optional[str] = None
    link_path: Optional[str] = None
    label_en: Optional[str] = None
    label_cn: Optional[str] = None
    display_order: int = 0
    source_type: str = 'manual'
    event_id: Optional[int] = None
    # Event details (populated if source is event)
    event_name: Optional[str] = None
    event_chinese_name: Optional[str] = None
    event_date: Optional[dt.date] = None
    event_time: Optional[str] = None
    event_location: Optional[str] = None
    event_description: Optional[str] = None
    event_signup_link: Optional[str] = None
    image_position: Optional[str] = None

    class Config:
        from_attributes = True


# Homepage Section Schemas
class HomepageSectionBase(BaseModel):
    title_en: str = Field(..., max_length=100)
    title_cn: Optional[str] = Field(None, max_length=100)
    image_url: Optional[str] = None  # No max_length - can store base64 data URLs
    image_position: Optional[str] = Field(None, max_length=50)
    link_path: str = Field(..., max_length=255)
    display_order: int = Field(default=0)
    is_active: bool = Field(default=True)


class HomepageSectionCreate(HomepageSectionBase):
    pass


class HomepageSectionUpdate(BaseModel):
    title_en: Optional[str] = Field(None, max_length=100)
    title_cn: Optional[str] = Field(None, max_length=100)
    image_url: Optional[str] = None  # No max_length - can store base64 data URLs
    image_position: Optional[str] = Field(None, max_length=50)
    link_path: Optional[str] = Field(None, max_length=255)
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class HomepageSectionResponse(HomepageSectionBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SectionReorderRequest(BaseModel):
    section_ids: List[int]  # List of section IDs in desired order


# Training Tip Status Enum
class TipStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


# Training Tip Category Enum
class TipCategory(str, Enum):
    recovery = "recovery"
    nutrition = "nutrition"
    technique = "technique"
    mental = "mental"
    gear = "gear"


# Training Tip Schemas
class TrainingTipBase(BaseModel):
    category: TipCategory
    title: str = Field(..., max_length=255)
    title_cn: Optional[str] = Field(None, max_length=255)
    content: str
    content_cn: Optional[str] = None
    video_url: Optional[str] = Field(None, max_length=500)
    video_platform: Optional[str] = Field(None, max_length=20)


class TrainingTipCreate(TrainingTipBase):
    pass


class TrainingTipUpdate(BaseModel):
    category: Optional[TipCategory] = None
    title: Optional[str] = Field(None, max_length=255)
    title_cn: Optional[str] = Field(None, max_length=255)
    content: Optional[str] = None
    content_cn: Optional[str] = None
    video_url: Optional[str] = Field(None, max_length=500)
    video_platform: Optional[str] = Field(None, max_length=20)
    status: Optional[TipStatus] = None


class TrainingTipResponse(TrainingTipBase):
    id: int
    author_name: Optional[str] = None
    author_id: Optional[int] = None
    upvotes: int = 0
    status: TipStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TrainingTipPublicResponse(BaseModel):
    """Public response (only approved tips)"""
    id: int
    category: TipCategory
    title: str
    title_cn: Optional[str] = None
    content: str
    content_cn: Optional[str] = None
    video_url: Optional[str] = None
    video_platform: Optional[str] = None
    author_name: Optional[str] = None
    upvotes: int = 0
    user_upvoted: bool = False

    class Config:
        from_attributes = True


class TrainingTipUpvoteResponse(BaseModel):
    tip_id: int
    upvotes: int
    user_upvoted: bool


# ========== Event Gallery Schemas ==========

class EventGalleryImageBase(BaseModel):
    caption: Optional[str] = Field(None, max_length=500)
    caption_cn: Optional[str] = Field(None, max_length=500)
    display_order: int = Field(default=0)


class EventGalleryImageCreate(EventGalleryImageBase):
    image_url: str  # Base64 data URL or external URL


class EventGalleryImageUpdate(BaseModel):
    caption: Optional[str] = Field(None, max_length=500)
    caption_cn: Optional[str] = Field(None, max_length=500)
    display_order: Optional[int] = None
    is_active: Optional[bool] = None
    uploaded_by_name: Optional[str] = Field(None, max_length=100)


class GalleryDeletionRequestResponse(BaseModel):
    id: int
    image_id: int
    requested_by_id: int
    requested_by_name: Optional[str] = None
    reason: str
    status: str
    resolved_by_id: Optional[int] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class EventGalleryImageResponse(EventGalleryImageBase):
    id: int
    event_id: int
    image_url: str
    is_active: bool = True
    uploaded_by_id: Optional[int] = None
    uploaded_by_name: Optional[str] = None
    like_count: int = 0
    user_liked: bool = False  # Populated based on requesting user
    has_pending_deletion_request: bool = False
    user_requested_deletion: bool = False
    deletion_request: Optional[GalleryDeletionRequestResponse] = None  # Populated for admins only
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EventGalleryPreviewResponse(BaseModel):
    """Lightweight response for card previews"""
    images: List[EventGalleryImageResponse]
    total_count: int
    has_more: bool


class EventGalleryImageLikeResponse(BaseModel):
    image_id: int
    like_count: int
    user_liked: bool


class BatchGalleryPreviewRequest(BaseModel):
    event_ids: List[int]
    anonymous_id: Optional[str] = None


class BatchGalleryPreviewResponse(BaseModel):
    previews: Dict[int, EventGalleryPreviewResponse]


class GalleryDeletionRequestCreate(BaseModel):
    reason: str = Field(..., min_length=1, max_length=1000)


class GalleryDeletionRequestResolve(BaseModel):
    approved: bool


# ========== Event Recurrence Schemas ==========

class RecurrenceType(str, Enum):
    weekly = "weekly"
    biweekly = "biweekly"
    monthly = "monthly"
    yearly = "yearly"
    custom = "custom"


class EventRecurrenceRuleBase(BaseModel):
    recurrence_type: RecurrenceType
    days_of_week: Optional[str] = None  # "0,1,2" for Sun,Mon,Tue
    day_of_month: Optional[int] = Field(None, ge=1, le=31)
    week_of_month: Optional[int] = Field(None, ge=1, le=5)  # 5 = last
    month_of_year: Optional[int] = Field(None, ge=1, le=12)
    custom_rule: Optional[str] = None  # JSON for complex rules
    end_date: Optional[dt.date] = None
    max_occurrences: Optional[int] = None


class EventRecurrenceRuleCreate(EventRecurrenceRuleBase):
    pass


class EventRecurrenceRuleUpdate(BaseModel):
    recurrence_type: Optional[RecurrenceType] = None
    days_of_week: Optional[str] = None
    day_of_month: Optional[int] = Field(None, ge=1, le=31)
    week_of_month: Optional[int] = Field(None, ge=1, le=5)
    month_of_year: Optional[int] = Field(None, ge=1, le=12)
    custom_rule: Optional[str] = None
    end_date: Optional[dt.date] = None
    max_occurrences: Optional[int] = None
    is_active: Optional[bool] = None


class EventRecurrenceRuleResponse(EventRecurrenceRuleBase):
    id: int
    event_id: int
    occurrences_created: int = 0
    last_generated_date: Optional[dt.date] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Extended Event schemas with recurrence support
class EventWithRecurrence(EventResponse):
    is_recurring: bool = False
    parent_event_id: Optional[int] = None
    next_occurrence_date: Optional[dt.date] = None
    recurrence: Optional[EventRecurrenceRuleResponse] = None


class EventCreateWithRecurrence(EventCreate):
    is_recurring: bool = False
    recurrence: Optional[EventRecurrenceRuleCreate] = None


# ========== Site Settings Schemas ==========

class SiteSettingBase(BaseModel):
    key: str = Field(..., max_length=100)
    value: Optional[str] = Field(None, max_length=500)
    label_en: Optional[str] = Field(None, max_length=100)
    label_cn: Optional[str] = Field(None, max_length=100)
    category: str = Field(default='social', max_length=50)
    is_active: bool = Field(default=True)


class SiteSettingCreate(SiteSettingBase):
    pass


class SiteSettingUpdate(BaseModel):
    value: Optional[str] = Field(None, max_length=500)
    label_en: Optional[str] = Field(None, max_length=100)
    label_cn: Optional[str] = Field(None, max_length=100)
    is_active: Optional[bool] = None


class SiteSettingResponse(SiteSettingBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SocialLinksResponse(BaseModel):
    """Response containing all social media links"""
    instagram: Optional[str] = None
    xiaohongshu: Optional[str] = None
    heylo: Optional[str] = None
    shop: Optional[str] = None
    shop_demo_video: Optional[str] = None


# ========== Event Group Schemas (iOS-style folder grouping) ==========

class EventGroupMergeRequest(BaseModel):
    """Request to merge two events into a group"""
    event_a_id: int  # Event being dragged
    event_b_id: int  # Event being dropped onto


class EventGroupMergeResponse(BaseModel):
    """Response after merging events"""
    parent_event_id: int
    group_name: str
    group_name_cn: Optional[str] = None
    event_count: int
    message: str


class EventGroupUpdateNameRequest(BaseModel):
    """Request to update group name"""
    group_name: str = Field(..., max_length=255)
    group_name_cn: Optional[str] = Field(None, max_length=255)


class EventInGroup(BaseModel):
    """Event data within a group"""
    id: int
    name: str
    chinese_name: Optional[str] = None
    date: dt.date
    time: Optional[str] = None
    location: Optional[str] = None
    chinese_location: Optional[str] = None
    image: Optional[str] = None
    status: str
    is_highlight: bool = False

    class Config:
        from_attributes = True


class EventGroup(BaseModel):
    """A group of related events"""
    parent_event_id: int
    group_name: str
    group_name_cn: Optional[str] = None
    event_count: int
    events: List[EventInGroup]
    # Cover info from most recent event
    cover_image: Optional[str] = None
    cover_image_position: Optional[str] = None
    cover_event_id: Optional[int] = None
    most_recent_date: dt.date


class HighlightsGroupedResponse(BaseModel):
    """Response for grouped highlights"""
    groups: List[EventGroup]
    standalone_events: List[EventResponse]