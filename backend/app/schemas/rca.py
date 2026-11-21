"""Pydantic models shared by the API, the LangGraph output and the frontend."""
from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    form_id: int | None = None  # which form the copilot fills; its current values are read from the database


class ChatResponse(BaseModel):
    reply: str
    form: dict
    changed_fields: list[str] = []
