from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.routes.auth import current_user
from db.database import get_db
from services.forms import load_forms

# Every route in this router requires a logged-in user
router = APIRouter(prefix="/api/forms", tags=["forms"], dependencies=[Depends(current_user)])


@router.get("")
async def list_forms(session: AsyncSession = Depends(get_db)):
    """Form definitions the frontend renders and the copilot fills."""
    return {"message": "Fetched forms successfully", "forms": await load_forms(session)}
