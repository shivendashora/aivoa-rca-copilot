from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.routes.auth import current_user
from db.database import get_db
from services.form_values import clear_values, load_values, save_values
from services.forms import load_form_fields, load_forms

# Every route in this router requires a logged-in user
router = APIRouter(prefix="/api/forms", tags=["forms"], dependencies=[Depends(current_user)])


class SaveValuesBody(BaseModel):
    """Only the fields being changed, keyed by field name. An empty string clears a field."""
    values: dict[str, str]


async def get_fields_or_404(session: AsyncSession, form_id: int) -> list[dict]:
    field_defs = await load_form_fields(session, form_id)
    if not field_defs:
        raise HTTPException(404, "Form not found")
    return field_defs


@router.get("")
async def list_forms(session: AsyncSession = Depends(get_db)):
    """Form definitions the frontend renders and the copilot fills."""
    return {"message": "Fetched forms successfully", "forms": await load_forms(session)}


@router.get("/{form_id}/values")
async def get_values(form_id: int, session: AsyncSession = Depends(get_db), user=Depends(current_user)):
    """The logged-in user's saved values for this form."""
    await get_fields_or_404(session, form_id)
    return {"message": "Fetched values successfully", "values": await load_values(session, user.id, form_id)}


@router.patch("/{form_id}/values")
async def update_values(
    form_id: int, body: SaveValuesBody, session: AsyncSession = Depends(get_db), user=Depends(current_user)
):
    """Saves fields the user edited by hand."""
    field_defs = await get_fields_or_404(session, form_id)
    unknown = set(body.values) - {f["name"] for f in field_defs}
    if unknown:
        raise HTTPException(422, f"Unknown field(s): {', '.join(sorted(unknown))}")
    await save_values(session, user.id, form_id, body.values, field_defs)
    await session.commit()
    return {"message": "Values saved successfully", "values": await load_values(session, user.id, form_id)}


@router.delete("/{form_id}/values")
async def delete_values(form_id: int, session: AsyncSession = Depends(get_db), user=Depends(current_user)):
    """Clears the user's draft so a new complaint can be logged."""
    await get_fields_or_404(session, form_id)
    await clear_values(session, user.id, form_id)
    await session.commit()
    return {"message": "Values cleared successfully", "values": {}}
