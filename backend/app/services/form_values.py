"""A user's saved field values for a form (their draft). The caller commits."""
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import FormValues, fields


async def load_values(session: AsyncSession, user_id: int, form_id: int) -> dict[str, str]:
    """Saved values keyed by field name, e.g. {"Customer Name": "MedPlus Pharmacy"}."""
    result = await session.execute(
        select(fields.field_name, FormValues.value)
        .join(fields, FormValues.field_id == fields.id)
        .where(FormValues.user_id == user_id, FormValues.form_id == form_id)
    )
    return {name: value for name, value in result.all() if value is not None}


async def save_values(
    session: AsyncSession, user_id: int, form_id: int, values: dict[str, str], field_defs: list[dict]
) -> None:
    """Inserts or updates the given fields. Names not in `field_defs` are ignored."""
    field_ids = {f["name"]: f["id"] for f in field_defs}
    rows = [
        {"user_id": user_id, "form_id": form_id, "field_id": field_ids[name], "value": value}
        for name, value in values.items()
        if name in field_ids
    ]
    if not rows:
        return
    stmt = pg_insert(FormValues).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_formvalues_user_field",
        set_={"value": stmt.excluded.value, "updated_at": func.now()},
    )
    await session.execute(stmt)


async def clear_values(session: AsyncSession, user_id: int, form_id: int) -> None:
    """Empties the user's draft of this form (start a new complaint)."""
    await session.execute(delete(FormValues).where(FormValues.user_id == user_id, FormValues.form_id == form_id))
