from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import insert, select

from api.routes import chat, forms, investigations,auth
from schemas.auth import UsersModel
from core.config import settings
from db import models  # noqa: F401  (registers tables on Base)
from db.database import Base, engine, get_db
from db.models import Users , FormFields, fieldType, fields
from api.routes.auth import sign_up
import uvicorn
from db.database import async_session_local



#    username: Mapped[str] = mapped_column(String(50), unique=True)
#    email : Mapped[str] = mapped_column(String(50),nullable = False, unique=True)
#    hashed_password: Mapped[str] = mapped_column(String(255))
#    role: Mapped[str] = mapped_column(String(20))  # e.g., admin, investigator, reviewer
#    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
#    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

from sqlalchemy import select, insert

async def intialize_base_queries(
    username: str,
    email: str,
    password: str
):
    async with async_session_local() as session:

        # ---------------------------------
        # 1. Initialize default user
        # ---------------------------------

        users = UsersModel(
            username=username,
            password=password,
            email=email
        )

        response = await sign_up(
            users=users,
            session=session
        )

        default_user_id = response["data"]["id"]

        print("Default user initialized:", default_user_id)

        # ---------------------------------
        # 2. Initialize field types
        # ---------------------------------

        field_types = [
            "text",
            "textarea",
            "dropdown",
            "date"
        ]

        for field_type in field_types:

            existing_type = await session.execute(
                select(fieldType.id).where(
                    fieldType.fieldType == field_type
                )
            )

            if existing_type.scalar_one_or_none() is None:

                await session.execute(
                    insert(fieldType).values(
                        fieldType=field_type
                    )
                )

        # Retrieve all field types and their IDs
        field_type_result = await session.execute(
            select(
                fieldType.id,
                fieldType.fieldType
            )
        )

        field_type_map = {
            field_type: field_type_id
            for field_type_id, field_type in field_type_result.all()
        }

        # ---------------------------------
        # 3. Initialize default form
        # ---------------------------------

        form_name = "Log Customer Complaint"

        existing_form = await session.execute(
            select(FormFields.id).where(
                FormFields.form_name == form_name,
                FormFields.user_id == default_user_id
            )
        )

        form_id = existing_form.scalar_one_or_none()

        if form_id is None:

            form_query = insert(FormFields).values(
                form_name=form_name,
                form_description=(
                    "API & FDF Quality Assurance Module - "
                    "customer complaint intake filled by AIVOA Copilot"
                ),
                user_id=default_user_id
            ).returning(FormFields.id)

            form_result = await session.execute(form_query)

            form_id = form_result.scalar_one()

        print("Default form initialized:", form_id)

        # ---------------------------------
        # 4. Define default form fields
        # ---------------------------------

        default_fields = [
            (
                "Complaint Source",
                "Channel the complaint came from, e.g. Pharmacy, Email",
                "dropdown"
            ),
            (
                "Customer Name",
                "Organisation or person who raised the complaint",
                "text"
            ),
            (
                "Product Name (API/FDF)",
                "Product or API named in the complaint",
                "text"
            ),
            (
                "Product Strength / Grade",
                "Strength for FDF (500 mg) or grade for API (IP/BP)",
                "text"
            ),
            (
                "Batch / Lot Number",
                "Batch or lot identifier, e.g. AMX240602",
                "text"
            ),
            (
                "Affected Quantity",
                "Quantity affected with unit, e.g. 12 capsules, 25 kg",
                "text"
            ),
            (
                "Manufacturing Date",
                "Manufacturing date as stated, or Not Provided",
                "date"
            ),
            (
                "Expiry Date",
                "Expiry date as stated, or Not Provided",
                "date"
            ),
            (
                "Originating Site Block",
                "Site area the defect most likely came from",
                "dropdown"
            ),
            (
                "Impacted Non-Product Materials (NPM)",
                "Packaging or material involved, e.g. HDPE Drum",
                "text"
            ),
            (
                "Complaint Category",
                "Defect class, e.g. Foreign Matter Contamination",
                "dropdown"
            ),
            (
                "Complaint Description",
                "Formal QMS summary of the complaint written by the AI",
                "textarea"
            ),
            (
                "Severity (Suggested)",
                "AI-reasoned severity: Minor, Major or Critical",
                "dropdown"
            ),
            (
                "Suggested Next Action",
                "AI-reasoned next step, e.g. Route to QA Investigation",
                "text"
            ),
            (
                "Initial Risk Assessment",
                "AI reasoning on likely cause and impact",
                "textarea"
            )
        ]

        # ---------------------------------
        # 5. Check existing fields
        # ---------------------------------

        existing_fields_result = await session.execute(
            select(fields.field_name).where(
                fields.form_id == form_id
            )
        )

        existing_field_names = set(
            existing_fields_result.scalars().all()
        )

        # ---------------------------------
        # 6. Insert only missing fields
        # ---------------------------------

        new_fields = []

        for field_name, description, field_type in default_fields:

            if field_name in existing_field_names:
                continue

            new_fields.append({
                "field_name": field_name,
                "field_description": description,
                "field_type_id": field_type_map[field_type],
                "form_id": form_id
            })

        if new_fields:
            await session.execute(
                insert(fields),
                new_fields
            )

        # ---------------------------------
        # 7. Commit initialization
        # ---------------------------------

        await session.commit()

        print("Default database initialization completed.")


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await intialize_base_queries(username = "default", email = "default@gmail.com", password = "default@123")

        yield

    finally:
        await engine.dispose()

    

app = FastAPI(title="AIVOA RCA Module", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,  # refresh-token cookie
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(chat.router)
app.include_router(investigations.router)
app.include_router(auth.router)
app.include_router(forms.router)

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)