"""SQLAlchemy tables. Flesh these out once the RCA form schema is final."""
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.database import Base


class BaseTables(Base):
    __abstract__ = True # for making this base tables class an abstract which makes sure its being implemnted across all the class which inherit this class

    created_at:Mapped[DateTime] = mapped_column(DateTime, server_default=func.now())
    updated_at:Mapped[DateTime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted_at:Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)


class Investigation(BaseTables):
    __tablename__ = "investigations"

    id: Mapped[int] = mapped_column(primary_key=True)
    rca_number: Mapped[str | None] = mapped_column(String(50), unique=True)  # unique already creates an index
    status: Mapped[str] = mapped_column(String(30), default="Pending Triage", index=True)  # filtered on in listings
    severity: Mapped[str | None] = mapped_column(String(20))
    # Deviation / incident details extracted by AI (product, batch, stage, equipment...)
    deviation: Mapped[dict] = mapped_column(JSON, default=dict)
    # 5 Whys chain + fishbone (6M) categories
    analysis: Mapped[dict] = mapped_column(JSON, default=dict)
    root_causes: Mapped[list] = mapped_column(JSON, default=list)
    missing_evidence: Mapped[list] = mapped_column(JSON, default=list)
    source_text: Mapped[str | None] = mapped_column(Text)
    confirmed_by: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    capa_actions: Mapped[list["CapaAction"]] = relationship(
        back_populates="investigation", cascade="all, delete-orphan"
    )


class CapaAction(BaseTables):
    __tablename__ = "capa_actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    investigation_id: Mapped[int] = mapped_column(ForeignKey("investigations.id"), index=True)  # FK
    action_type: Mapped[str] = mapped_column(String(20))  # Corrective | Preventive
    description: Mapped[str] = mapped_column(Text)
    rationale: Mapped[str | None] = mapped_column(Text)
    owner: Mapped[str | None] = mapped_column(String(100))
    due_date: Mapped[str | None] = mapped_column(String(30))
    effectiveness_check: Mapped[str | None] = mapped_column(Text)

    investigation: Mapped[Investigation] = relationship(back_populates="capa_actions")


class Users(BaseTables):
    __tablename__ = "users"
    # No extra indexes needed: id (primary key), username and email (unique) are already indexed.

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    email : Mapped[str] = mapped_column(String(50),nullable = False, unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))  # e.g., admin, investigator, reviewer
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class RevokedToken(Base):
    """Tokens invalidated by logout. Checked on refresh and on every authenticated request."""
    __tablename__ = "revoked_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    jti: Mapped[str] = mapped_column(String(64), unique=True)  # unique already creates an index
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)  # used when deleting expired rows
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class FormFields(Base):
    __tablename__ = "formfields"

    id:Mapped[int] = mapped_column(Integer,primary_key=True)
    form_name:Mapped[str] = mapped_column(String)
    form_description:Mapped[str] = mapped_column(String)
    user_id:Mapped[int] = mapped_column(Integer,ForeignKey("users.id",ondelete="CASCADE"), index=True)  # FK


class fieldType(BaseTables):
    __tablename__ = "fieldType"

    id:Mapped[int] = mapped_column(Integer,primary_key=True)
    fieldType:Mapped[str] = mapped_column(String)


class fields(BaseTables):
    __tablename__ = "fields"

    id:Mapped[int] = mapped_column(Integer,primary_key=True)
    field_name : Mapped[str] = mapped_column(String)
    field_description : Mapped[str] = mapped_column(String)
    field_type_id : Mapped[int] = mapped_column(Integer,ForeignKey("fieldType.id"), index=True)  # FK
    form_id:Mapped[int] = mapped_column(Integer,ForeignKey("formfields.id",ondelete="CASCADE"), index=True)  # FK


class FileAttachments(BaseTables):
    __tablename__ = "fileAttachments"

    id:Mapped[int] = mapped_column(Integer,primary_key=True)
    filename:Mapped[str] = mapped_column(String)
    fileType:Mapped[str] = mapped_column(String)
    filePath:Mapped[str] = mapped_column(String)


class chatMessages(BaseTables):
    __tablename__ = "chatmessages"
    __table_args__ = (
        # Loading a user's chat history in order; also covers lookups by user_id alone
        Index("ix_chatmessages_user_id_created_at", "user_id", "created_at"),
    )

    id:Mapped[int] = mapped_column(Integer,primary_key = True)
    queryMessages:Mapped[str | None] = mapped_column(String,nullable=True)
    agentResponse:Mapped[str | None] = mapped_column(String,nullable=True)
    user_id:Mapped[int] = mapped_column(Integer,ForeignKey("users.id",ondelete="CASCADE"))
    fileAttachmentsId:Mapped[int | None] = mapped_column(Integer,ForeignKey("fileAttachments.id",ondelete="CASCADE"),nullable=True, index=True)  # FK


class FormValues(BaseTables):
    """The current value of one form field for one user (their draft). Filled by the copilot or by hand."""
    __tablename__ = "formvalues"
    __table_args__ = (
        # One value per user per field: saving again updates the same row
        UniqueConstraint("user_id", "field_id", name="uq_formvalues_user_field"),
        # Loading a user's draft of one form
        Index("ix_formvalues_user_id_form_id", "user_id", "form_id"),
    )

    id:Mapped[int] = mapped_column(Integer,primary_key=True)
    user_id:Mapped[int] = mapped_column(Integer,ForeignKey("users.id",ondelete="CASCADE"))
    form_id:Mapped[int] = mapped_column(Integer,ForeignKey("formfields.id",ondelete="CASCADE"))
    field_id:Mapped[int] = mapped_column(Integer,ForeignKey("fields.id",ondelete="CASCADE"))
    value:Mapped[str | None] = mapped_column(Text,nullable=True)
