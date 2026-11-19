from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession,async_sessionmaker
from sqlalchemy.orm import declarative_base

from core.config import settings

Base = declarative_base()
engine = create_async_engine(
    settings.database_url,  # DATABASE_URL in backend/.env
    echo=True
)

async_session_local = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)


async def get_db():
    async with async_session_local() as session:
        yield session
