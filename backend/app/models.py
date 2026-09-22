"""All ORM models (single module so every domain imports from `app.models`)."""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Integer, JSON, Numeric,
    SmallInteger, String, Text, UniqueConstraint, Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

# Portable column types: work on PostgreSQL and SQLite (dev fallback).
UuidType = Uuid(native_uuid=True)
JSONBType = JSONB().with_variant(JSON(), "sqlite")


# ---------------------------------------------------------------- users / auth
class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(160))
    role: Mapped[str] = mapped_column(String(20), default="client", nullable=False)  # client|consultant|admin
    locale: Mapped[str] = mapped_column(String(2), default="es", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)  # active|invited|disabled
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UuidType, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    __table_args__ = (CheckConstraint("role in ('client','consultant','admin')", name="ck_user_role"),)


class MagicLinkToken(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "magic_link_tokens"
    user_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class RefreshToken(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "refresh_tokens"
    user_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------- leads / orgs
class Lead(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "leads"
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    job_title: Mapped[Optional[str]] = mapped_column(String(120))
    company_email: Mapped[str] = mapped_column(String(320), index=True, nullable=False)
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)
    company_size: Mapped[Optional[str]] = mapped_column(String(40))
    industry: Mapped[Optional[str]] = mapped_column(String(80))
    country: Mapped[Optional[str]] = mapped_column(String(80))
    terms_accepted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    locale: Mapped[str] = mapped_column(String(2), default="es", nullable=False)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UuidType, ForeignKey("users.id", ondelete="SET NULL"))


class Organization(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "organizations"
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sector: Mapped[Optional[str]] = mapped_column(String(80))
    size: Mapped[Optional[str]] = mapped_column(String(40))
    country: Mapped[Optional[str]] = mapped_column(String(80))
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    legal_name: Mapped[Optional[str]] = mapped_column(String(200))
    address: Mapped[Optional[str]] = mapped_column(Text)
    tax_id: Mapped[Optional[str]] = mapped_column(String(40))
    logo_url: Mapped[Optional[str]] = mapped_column(Text)
    doc_locale: Mapped[str] = mapped_column(String(2), default="es", nullable=False)
    theme: Mapped[str] = mapped_column(String(10), default="light", nullable=False)
    plan: Mapped[str] = mapped_column(String(10), default="free", nullable=False)  # free|pro
    __table_args__ = (CheckConstraint("plan in ('free','pro')", name="ck_org_plan"),)


class OrgMember(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "org_members"
    organization_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("organizations.id", ondelete="CASCADE"))
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UuidType, ForeignKey("users.id", ondelete="SET NULL"))
    role: Mapped[str] = mapped_column(String(20), default="leader", nullable=False)  # admin|leader
    area_key: Mapped[Optional[str]] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)  # active|invited|pending


# ---------------------------------------------------------------- assessments / questions
class Assessment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "assessments"
    organization_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("organizations.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20), default="in_progress", nullable=False)  # draft|in_progress|completed
    plan: Mapped[str] = mapped_column(String(10), default="free", nullable=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class Question(Base, UUIDMixin):
    __tablename__ = "questions"
    module: Mapped[str] = mapped_column(String(10), nullable=False)  # maturity|area
    area_key: Mapped[Optional[str]] = mapped_column(String(20))
    block_id: Mapped[str] = mapped_column(String(4), nullable=False)
    code: Mapped[str] = mapped_column(String(8), nullable=False)
    position: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    dimension: Mapped[Optional[str]] = mapped_column(String(20))
    __table_args__ = (UniqueConstraint("module", "area_key", "code", name="uq_question_code"),)


class QuestionTranslation(Base, UUIDMixin):
    __tablename__ = "question_translations"
    question_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("questions.id", ondelete="CASCADE"))
    locale: Mapped[str] = mapped_column(String(2), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    block_title: Mapped[Optional[str]] = mapped_column(String(200))
    __table_args__ = (UniqueConstraint("question_id", "locale", name="uq_qtrans"),)


class Answer(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "answers"
    assessment_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("assessments.id", ondelete="CASCADE"))
    question_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("questions.id", ondelete="CASCADE"))
    value: Mapped[Optional[int]] = mapped_column(SmallInteger)
    state: Mapped[str] = mapped_column(String(12), default="answered", nullable=False)  # answered|idk|delegated|pending
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UuidType, ForeignKey("users.id", ondelete="SET NULL"))
    __table_args__ = (
        UniqueConstraint("assessment_id", "question_id", name="uq_answer"),
        CheckConstraint("value is null or (value >= 1 and value <= 5)", name="ck_answer_value"),
    )


class AreaState(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "area_states"
    assessment_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("assessments.id", ondelete="CASCADE"))
    area_key: Mapped[str] = mapped_column(String(20), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    progress: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    leader_member_id: Mapped[Optional[uuid.UUID]] = mapped_column(UuidType, ForeignKey("org_members.id", ondelete="SET NULL"))
    __table_args__ = (UniqueConstraint("assessment_id", "area_key", name="uq_area_state"),)


# ---------------------------------------------------------------- delegation / documents
class Delegation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "delegations"
    assessment_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("assessments.id", ondelete="CASCADE"))
    question_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("questions.id", ondelete="CASCADE"))
    delegate_name: Mapped[str] = mapped_column(String(160), nullable=False)
    delegate_email: Mapped[str] = mapped_column(String(320), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(12), default="sent", nullable=False)  # sent|answered|expired
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    answered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class Document(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "documents"
    organization_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("organizations.id", ondelete="CASCADE"))
    assessment_id: Mapped[Optional[uuid.UUID]] = mapped_column(UuidType, ForeignKey("assessments.id", ondelete="CASCADE"))
    question_id: Mapped[Optional[uuid.UUID]] = mapped_column(UuidType, ForeignKey("questions.id", ondelete="SET NULL"))
    area_key: Mapped[Optional[str]] = mapped_column(String(20))
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(UuidType, ForeignKey("users.id", ondelete="SET NULL"))
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------- team / invitations
class Invitation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "invitations"
    organization_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("organizations.id", ondelete="CASCADE"))
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    whatsapp: Mapped[Optional[str]] = mapped_column(String(32))
    phone: Mapped[Optional[str]] = mapped_column(String(32))
    area_key: Mapped[Optional[str]] = mapped_column(String(20))
    token_hash: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(12), default="sent", nullable=False)  # sent|accepted|expired


# ---------------------------------------------------------------- estimator / payments
class Quote(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "quotes"
    organization_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("organizations.id", ondelete="CASCADE"))
    base_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    areas: Mapped[dict] = mapped_column(JSONBType, default=dict)
    final_report: Mapped[bool] = mapped_column(Boolean, default=False)
    distributor_code: Mapped[Optional[str]] = mapped_column(String(40))
    subtotal: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    discount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)


class Payment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "payments"
    organization_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("organizations.id", ondelete="CASCADE"))
    quote_id: Mapped[Optional[uuid.UUID]] = mapped_column(UuidType, ForeignKey("quotes.id", ondelete="SET NULL"))
    provider: Mapped[str] = mapped_column(String(20), default="stripe", nullable=False)
    provider_ref: Mapped[Optional[str]] = mapped_column(String(160), index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    status: Mapped[str] = mapped_column(String(12), default="pending", nullable=False)  # pending|succeeded|failed|refunded


class WebhookEvent(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "webhook_events"
    provider: Mapped[str] = mapped_column(String(20), default="stripe", nullable=False)
    event_id: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    type: Mapped[Optional[str]] = mapped_column(String(80))
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------- distributor codes
class DistributorCode(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "distributor_codes"
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    discount_pct: Mapped[int] = mapped_column(SmallInteger, default=10, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


# ---------------------------------------------------------------- reviews / consultant
class Review(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "reviews"
    assessment_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("assessments.id", ondelete="CASCADE"))
    mode: Mapped[str] = mapped_column(String(10), default="async", nullable=False)  # sync|async
    stage: Mapped[int] = mapped_column(SmallInteger, default=1, nullable=False)  # 0|1|2
    consultant_id: Mapped[Optional[uuid.UUID]] = mapped_column(UuidType, ForeignKey("users.id", ondelete="SET NULL"))


class ReviewChapter(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "review_chapters"
    review_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("reviews.id", ondelete="CASCADE"))
    chapter_key: Mapped[str] = mapped_column(String(40), nullable=False)
    validated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    validator_id: Mapped[Optional[uuid.UUID]] = mapped_column(UuidType, ForeignKey("users.id", ondelete="SET NULL"))
    note: Mapped[Optional[str]] = mapped_column(Text)
    validated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class ConsultantRating(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "consultant_ratings"
    review_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("reviews.id", ondelete="CASCADE"))
    chapter_key: Mapped[str] = mapped_column(String(40), nullable=False)
    knowledge: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    friendliness: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    methodology: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    comments: Mapped[Optional[str]] = mapped_column(Text)


class ConsultantNote(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "consultant_notes"
    organization_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("organizations.id", ondelete="CASCADE"))
    consultant_id: Mapped[Optional[uuid.UUID]] = mapped_column(UuidType, ForeignKey("users.id", ondelete="SET NULL"))
    body: Mapped[str] = mapped_column(Text, nullable=False)


class ReportJob(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "report_jobs"
    assessment_id: Mapped[uuid.UUID] = mapped_column(UuidType, ForeignKey("assessments.id", ondelete="CASCADE"))
    locale: Mapped[str] = mapped_column(String(2), default="es", nullable=False)
    status: Mapped[str] = mapped_column(String(12), default="processing", nullable=False)  # processing|ready|failed
    storage_key: Mapped[Optional[str]] = mapped_column(Text)
