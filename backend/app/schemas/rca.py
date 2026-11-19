"""Pydantic models shared by the API, the LangGraph output and the frontend."""
from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    current_form: dict = {}
    form_id: int | None = None  # which form's fields the copilot fills


class ChatResponse(BaseModel):
    reply: str
    form: dict
    changed_fields: list[str] = []
