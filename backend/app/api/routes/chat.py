import asyncio
import json
import logging
import shutil

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, WebSocketDisconnect
from pathlib import Path
from pydantic import BaseModel
from sqlalchemy import insert, select, update
from sqlalchemy.exc import SQLAlchemyError

from agents.graph import rca_graph
from api.routes.auth import current_user, get_current_user
from db.models import FileAttachments,chatMessages
from db.database import get_db
from schemas.rca import ChatRequest, ChatResponse
from services.extraction import extract_email_text, extract_pdf_text
from services.forms import load_form_fields
from fastapi import WebSocket
from openai import AsyncOpenAI
from core.config import settings
import os
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["copilot"])
DISK_PATH = Path(
    os.getenv(
        "DISK_PATH",
        r"C:\Users\shive\projects\aivoa-rca\backend\uploads"
    )
)

AGENT_FAILED = "The copilot could not process this right now. Please try again."


def save_file_to_disk(file: UploadFile):

    DISK_PATH.mkdir(parents=True, exist_ok=True)
    filename = Path(file.filename or "upload").name
    file_path = DISK_PATH / filename
    with file_path.open("wb") as destination:
        shutil.copyfileobj(file.file, destination)

    return str(file_path)


def read_document_text(file_path: str, filename: str) -> str:
    """Plain text of an uploaded .pdf, .eml or text file."""
    data = Path(file_path).read_bytes()
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        return extract_pdf_text(data)
    if suffix == ".eml":
        return extract_email_text(data)
    return data.decode("utf-8", errors="replace")


async def run_copilot(state: dict) -> dict:
    """Runs the LangGraph workflow off the event loop (the LLM call blocks)."""
    out = await asyncio.to_thread(rca_graph.invoke, state)
    return {
        "reply": out.get("reply", ""),
        "form": out.get("form", state.get("form", {})),
        "changed_fields": out.get("changed_fields", []),
    }


def parse_client_message(raw: str) -> tuple[str, int | None, dict]:
    """The client sends {"message", "form_id", "current_form"} as JSON. Plain text is accepted too."""
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return raw, None, {}
    if not isinstance(payload, dict):
        return raw, None, {}
    form_id = payload.get("form_id")
    current_form = payload.get("current_form")
    return (
        str(payload.get("message") or ""),
        form_id if isinstance(form_id, int) else None,
        current_form if isinstance(current_form, dict) else {},
    )


@router.websocket("/ws")
async def websocket_endpoint(websocket:WebSocket,session = Depends(get_db)):
    """
    One reply per message, in order:
      {"type": "reply", "reply", "form", "changed_fields"}  saved and answered
      {"type": "error", "saved": bool, "detail"}             saved=False: the message itself wasn't stored
    """
    await websocket.accept()
    token = websocket.query_params.get("access_token")
    if not token:
       await websocket.close(code=1008)
       return

    try:
        userId = int(get_current_user(token))
    except (HTTPException, ValueError):
        await websocket.close(code=1008, reason="Invalid or expired token")
        return

    try:
        while True:
            raw = await websocket.receive_text()
            message, form_id, current_form = parse_client_message(raw)
            if not message.strip():
                await websocket.send_json({"type": "error", "saved": False, "detail": "Empty message"})
                continue

            # 1. Save the user's message
            try:

                result = await session.execute(
                    insert(chatMessages).values(
                        queryMessages = message,
                        agentResponse = None,
                        user_id = userId,
                        fileAttachmentsId = None
                    ).returning(chatMessages.id)
                )
                chat_id = result.scalar_one()
                await session.commit()
            except SQLAlchemyError:
                await session.rollback()
                logger.exception("Failed to save chat message for user %s", userId)
                await websocket.send_json({"type": "error", "saved": False, "detail": "Message could not be saved"})
                continue

            # 2. Ask the copilot to fill the form, then save its reply on the same row
            try:
                fields = await load_form_fields(session, form_id) if form_id else []
                out = await run_copilot({"user_message": message, "form": current_form, "fields": fields})
                await session.execute(
                    update(chatMessages).where(chatMessages.id == chat_id).values(agentResponse = out["reply"])
                )
                await session.commit()
            except Exception:
                await session.rollback()
                logger.exception("Copilot failed for chat %s", chat_id)
                await websocket.send_json({"type": "error", "saved": True, "detail": AGENT_FAILED})
                continue

            await websocket.send_json({"type": "reply", **out})

    except WebSocketDisconnect:
        pass



@router.get('/getAllChats')
async def getChats(session = Depends(get_db),user = Depends(current_user)):

    try:
        # Outer join: text messages have no attachment, so their filename comes back as null
        chatsQuery = select(
            chatMessages.queryMessages,
            chatMessages.agentResponse,
            FileAttachments.filename,
        ).outerjoin(
            FileAttachments, chatMessages.fileAttachmentsId == FileAttachments.id
        ).where(
            chatMessages.user_id == user.id
        ).order_by(chatMessages.id.asc())

        chats = await session.execute(chatsQuery)
        chats = chats.mappings().all()

        return{
            "message":"Fetched Chats Successfully",
            "chats":chats
        }

    except:
        raise HTTPException(
            status_code = 500,
            detail="Could not get db results"
        )

@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest, session = Depends(get_db), _user = Depends(current_user)):
    """Same as one WebSocket message, without saving it. Handy for testing from /docs."""
    fields = await load_form_fields(session, req.form_id) if req.form_id else []
    out = await run_copilot({"user_message": req.message, "form": req.current_form, "fields": fields})
    return ChatResponse(**out)


@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    form_id: int | None = Form(None),
    current_form: str = Form("{}"),
    session = Depends(get_db),
    _user = Depends(current_user),
):
    """
    Saves the file and a chat row for it, then lets the copilot fill the form from its text.
    The file stays saved even if reading it or the copilot fails; `reply` is then null and `error` says why.
    """
    # Keep the original name (not lowercased) so the chat shows it as the user uploaded it
    name = Path(file.filename or "upload").name

    file_path = await asyncio.to_thread(save_file_to_disk,file)

    query = insert(FileAttachments).values(
        filename = name,
        filePath = file_path,
        fileType = file.content_type
    ).returning(
        FileAttachments.id
    )

    fileAttachmetData = await session.execute(query)
    fileAttachmetData = fileAttachmetData.scalars().one_or_none()

    chatQuery = insert(chatMessages).values(
        queryMessages = None,  # a file message has no text; its name comes from fileAttachments
        agentResponse = None,
        user_id = _user.id,
        fileAttachmentsId = fileAttachmetData
    ).returning(chatMessages.id)

    chat_id = (await session.execute(chatQuery)).scalar_one()

    await session.commit()

    response = {
        "message": "File uploaded and saved successfully",
        "filename": name,
        "reply": None,
        "form": None,
        "changed_fields": [],
        "error": None,
    }

    try:
        form = json.loads(current_form)
    except json.JSONDecodeError:
        form = {}

    try:
        text = await asyncio.to_thread(read_document_text, file_path, name)
        if not text.strip():
            response["error"] = "No readable text was found in this file."
            return response

        fields = await load_form_fields(session, form_id) if form_id else []
        out = await run_copilot({
            "intent": "extract_document",
            "source_text": text,
            "form": form if isinstance(form, dict) else {},
            "fields": fields,
        })
        await session.execute(
            update(chatMessages).where(chatMessages.id == chat_id).values(agentResponse = out["reply"])
        )
        await session.commit()
        response.update(out)
    except Exception:
        await session.rollback()
        logger.exception("Copilot failed for uploaded file %s", name)
        response["error"] = AGENT_FAILED

    return response
