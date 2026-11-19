from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.routes.auth import current_user
from db.database import get_db
from db.models import Investigation

# Every route in this router requires a logged-in user
router = APIRouter(prefix="/api/investigations", tags=["investigations"], dependencies=[Depends(current_user)])


@router.get("")
async def list_investigations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Investigation).order_by(Investigation.id.desc()))
    rows = result.scalars().all()
    return [{"id": i.id, "rca_number": i.rca_number, "status": i.status, "severity": i.severity} for i in rows]


@router.get("/{inv_id}")
async def get_investigation(inv_id: int, db: AsyncSession = Depends(get_db)):
    inv = await db.get(Investigation, inv_id)
    if not inv:
        raise HTTPException(404, "Not found")
    # Column values only: related rows (capa_actions) can't be lazy-loaded on an async session
    return {c.key: getattr(inv, c.key) for c in Investigation.__table__.columns}


# TODO: POST (Commit to QMS) and PUT endpoints once the form schema is final
