from uuid import uuid4

from fastapi import APIRouter, Cookie, Depends, Response
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from fastapi import HTTPException, status
from sqlalchemy import insert, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from schemas.auth import RefreshTokenModel, UsersModel
from db.database import get_db
from db.models import RevokedToken, Users
from pwdlib import PasswordHash
from jose import JWTError,jwt
from datetime import datetime,timedelta, timezone


router = APIRouter(prefix = "/api/auth", tags=["auth"])
password_hash = PasswordHash.recommended()

# All read from backend/.env through core.config.settings
secret_key = settings.secret_key
algorithm = settings.algorithm
ACCESS_TOKEN_EXPIRES = timedelta(minutes=settings.access_token_expire_minutes)
REFRESH_TOKEN_EXPIRES = timedelta(days=settings.refresh_token_expire_days)

# Refresh token lives in an httpOnly cookie (page scripts can't read it),
# sent by the browser only to /api/auth/* routes
REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/auth"


def set_refresh_cookie(response: Response, refresh_token: str):
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        max_age=int(REFRESH_TOKEN_EXPIRES.total_seconds()),
        path=REFRESH_COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response):
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path=REFRESH_COOKIE_PATH,
    )

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")
# Same, but returns None instead of 401 when there's no token (used by logout)
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)


def credentials_exception(detail: str = "Could not validate credentials"):
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def decode_token(token: str, token_type: str) -> dict:
    """Decodes a JWT and checks it's the expected type ("access" / "refresh"). Raises 401 otherwise."""
    try:
        payload = jwt.decode(token, secret_key, algorithms=[algorithm])
    except JWTError:
        raise credentials_exception("Invalid or expired token")
    if payload.get("type") != token_type or not payload.get("sub"):
        raise credentials_exception("Invalid token type")
    return payload


def get_current_user(token : str):
    """Returns the user id (str) from an access token. Raises 401 if invalid, expired or not an access token.
    Plain function so it also works where Depends isn't available (e.g. the chat WebSocket)."""
    return decode_token(token, "access").get("sub")


async def is_revoked(session: AsyncSession, jti: str | None) -> bool:
    if not jti:
        return False
    result = await session.execute(select(RevokedToken.id).where(RevokedToken.jti == jti))
    return result.first() is not None


async def revoke_token(session: AsyncSession, payload: dict):
    jti = payload.get("jti")
    if not jti or await is_revoked(session, jti):
        return
    session.add(RevokedToken(
        jti=jti,
        expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc).replace(tzinfo=None),
    ))


async def current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_db),
) -> Users:
    """Route dependency: `user: Users = Depends(current_user)`. 401 if not logged in."""
    payload = decode_token(token, "access")
    if await is_revoked(session, payload.get("jti")):
        raise credentials_exception("Token has been revoked")

    user = await session.get(Users, int(payload["sub"]))
    if user is None or user.deleted_at is not None:
        raise credentials_exception("User not found")
    return user


def require_roles(*roles: str):
    """Route dependency for role checks: `user: Users = Depends(require_roles("admin", "reviewer"))`."""
    async def checker(user: Users = Depends(current_user)) -> Users:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed for your role")
        return user
    return checker


def hash_password(password : str):
    return password_hash.hash(password=password)


def verify_password(password: str, hashed_password: str):
    return password_hash.verify(password, hashed_password)


def create_token(userId: int, token_type: str, expires_in: timedelta):
    payload = {
        "sub": str(userId),
        "type": token_type,
        "jti": uuid4().hex,  # unique id, so logout can revoke this exact token
        "exp": datetime.now(timezone.utc) + expires_in
    }
    return jwt.encode(payload, secret_key, algorithm=algorithm)


def generate_tokens(userId: int = None, refresh_token: str = None):

    # Refresh token flow
    if refresh_token:

        try:
            payload = jwt.decode(
                refresh_token,
                secret_key,
                algorithms=[algorithm]
            )

            if payload.get("type") != "refresh":
                raise HTTPException(
                    status_code=401,
                    detail="Invalid refresh token"
                )

            userId = int(payload.get("sub"))

        except (JWTError, TypeError, ValueError):
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired refresh token"
            )

        return {
            "access_token": create_token(userId, "access", ACCESS_TOKEN_EXPIRES),
            "refresh_token": refresh_token,
            "token_type": "bearer"
        }

    # Normal login flow
    if userId is None:
        raise HTTPException(
            status_code=400,
            detail="User ID is required"
        )

    return {
        "access_token": create_token(userId, "access", ACCESS_TOKEN_EXPIRES),
        "refresh_token": create_token(userId, "refresh", REFRESH_TOKEN_EXPIRES),
        "token_type": "bearer"
    }

@router.post("/login")
async def login(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session = Depends(get_db)
):

    username = form_data.username
    password = form_data.password

    # The login form's field can hold either the username or the email
    query = select(Users).where(
        or_(Users.username == username, Users.email == username)
    )

    usersData = await session.execute(query)
    await session.commit()
    # first(): older rows may share an email (uniqueness is only enforced for new sign-ups)
    usersData = usersData.scalars().first()

    # Same error for unknown user and wrong password, so the API doesn't reveal which usernames exist
    if usersData is None or not verify_password(password,usersData.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail = "Could not verify password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    tokens = generate_tokens(usersData.id)
    set_refresh_cookie(response, tokens["refresh_token"])
    return {
        "message": "Login successful",
        "data":{
            "access_token":tokens["access_token"],
            "token_type":tokens["token_type"]
        }
    }


@router.post("/refresh")
async def refresh(
    response: Response,
    body: RefreshTokenModel | None = None,
    refresh_token: str | None = Cookie(default=None),
    session: AsyncSession = Depends(get_db),
):
    # Browser: refresh token comes from the httpOnly cookie set at login.
    # Body {"refresh_token": "..."} still works for Swagger / Postman.
    token = refresh_token or (body.refresh_token if body else None)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing"
        )

    # Logged-out refresh tokens can't be used again
    try:
        jti = jwt.get_unverified_claims(token).get("jti")
    except JWTError:
        jti = None
    if await is_revoked(session, jti):
        clear_refresh_cookie(response)
        raise credentials_exception("Refresh token has been revoked")

    # generate_tokens validates the refresh token and raises 401 if it's invalid or expired
    tokens = generate_tokens(refresh_token=token)
    set_refresh_cookie(response, tokens["refresh_token"])
    return {
        "message": "Token refreshed",
        "data":{
            "access_token":tokens["access_token"],
            "token_type":tokens["token_type"]
        }
    }


@router.get("/me")
async def me(user: Users = Depends(current_user)):
    return {
        "message": "Current user",
        "data":{
            "id":user.id,
            "username":user.username,
            "email":user.email,
            "role":user.role
        }
    }


@router.post("/logout")
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    access_token: str | None = Depends(optional_oauth2_scheme),
    session: AsyncSession = Depends(get_db),
):
    # Revoke both tokens so they stop working right away, not just when they expire.
    # Invalid or expired tokens are skipped: logout should always succeed.
    for token, token_type in ((refresh_token, "refresh"), (access_token, "access")):
        if not token:
            continue
        try:
            await revoke_token(session, decode_token(token, token_type))
        except HTTPException:
            pass
    await session.commit()

    clear_refresh_cookie(response)
    return {"message": "Logout successful"}


@router.post("/sign-up")
async def sign_up(
    users: UsersModel,
    session=Depends(get_db)
):
    if not users:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No user Data present"
        )

    # Check whether user already exists
    existing = await session.execute(
        select(Users).where(
            Users.email == users.email
        )
    )

    existing_user_data = existing.scalar_one_or_none()

    if existing_user_data is not None:

        # Reuse existing user
        user_id = existing_user_data.id
        username = existing_user_data.username
        email = existing_user_data.email

    else:

        # Create new user
        hashed_password = hash_password(users.password)

        query = insert(Users).values(
            username=users.username,
            hashed_password=hashed_password,
            email=users.email,
            role=settings.default_user_role,
        ).returning(Users)

        try:
            response = await session.execute(query)
            await session.commit()

        except IntegrityError:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already exists"
            )

        userData = response.scalars().one()

        user_id = userData.id
        username = userData.username
        email = userData.email

    return {
        "message": "User retrieved successfully",
        "data": {
            "id": user_id,
            "username": username,
            "email": email
        }
    }


@router.post("/reset-password")
def reset_password():
    return {"message": "Password reset successful"}