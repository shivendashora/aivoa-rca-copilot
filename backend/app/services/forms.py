"""Read form definitions (formfields -> fields -> fieldType) from the database."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import FormFields, fieldType, fields


async def load_form_fields(session: AsyncSession, form_id: int) -> list[dict]:
    """Fields of one form, in the order they were created: [{id, name, description, type}]."""
    result = await session.execute(
        select(fields.id, fields.field_name, fields.field_description, fieldType.fieldType)
        .join(fieldType, fields.field_type_id == fieldType.id)
        .where(fields.form_id == form_id, fields.deleted_at.is_(None))
        .order_by(fields.id)
    )
    return [
        {"id": row.id, "name": row.field_name, "description": row.field_description, "type": row.fieldType}
        for row in result.all()
    ]


async def load_forms(session: AsyncSession) -> list[dict]:
    """Every form with its fields: [{id, name, description, fields: [...]}]."""
    result = await session.execute(select(FormFields).order_by(FormFields.id))
    forms = result.scalars().all()
    return [
        {
            "id": f.id,
            "name": f.form_name,
            "description": f.form_description,
            "fields": await load_form_fields(session, f.id),
        }
        for f in forms
    ]
