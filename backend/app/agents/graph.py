"""LangGraph workflow: router -> tool node -> END.

  - log_rca:          free-text incident -> fill the form
  - edit_rca:         more details or a correction -> update only the fields that change
  - extract_document: PDF/email text -> fill the form
"""
import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph

from agents.llm import get_llm
from agents.prompts import EDIT_TASK, EXTRACT_TASK, LOG_TASK, SYSTEM_PROMPT
from agents.state import RcaState

logger = logging.getLogger(__name__)

# Keeps a long document inside the model's per-request token limit
MAX_SOURCE_CHARS = 12000


def router(state: RcaState) -> RcaState:
    if state.get("intent"):
        return {}
    # A form with values already in it is being edited; an empty one is a new report
    has_values = any(str(v).strip() for v in state.get("form", {}).values())
    return {"intent": "edit_rca" if has_values else "log_rca"}


def _fill_form(state: RcaState, task: str, user_input: str) -> RcaState:
    """Asks the LLM for field values and merges them into the current form."""
    form = dict(state.get("form") or {})
    field_defs = state.get("fields") or []
    if not field_defs:
        return {"reply": "No form is loaded, so there is nothing to fill yet.", "form": form, "changed_fields": []}

    field_list = "\n".join(f"- {f['name']}: {f['description']} [{f['type']}]" for f in field_defs)
    current = json.dumps({k: v for k, v in form.items() if v}, ensure_ascii=False)
    messages = [
        SystemMessage(SYSTEM_PROMPT.format(field_list=field_list, task=task)),
        HumanMessage(f"Current form values: {current}\n\n{user_input}"),
    ]

    llm = get_llm().bind(response_format={"type": "json_object"})
    raw = llm.invoke(messages).content
    try:
        data = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        logger.warning("LLM returned invalid JSON: %r", raw)
        return {"reply": "Sorry, I couldn't read that. Could you rephrase it?", "form": form, "changed_fields": []}

    # Keep only real field names with non-empty values
    allowed = {f["name"] for f in field_defs}
    updates = data.get("fields") if isinstance(data.get("fields"), dict) else {}
    changed = []
    for name, value in updates.items():
        if name not in allowed or value is None or str(value).strip() == "":
            continue
        value = str(value).strip()
        if form.get(name) != value:
            form[name] = value
            changed.append(name)

    reply = str(data.get("reply") or "").strip() or (
        f"Updated {len(changed)} field(s)." if changed else "Nothing in the form needed to change."
    )
    return {"reply": reply, "form": form, "changed_fields": changed}


def log_rca(state: RcaState) -> RcaState:
    return _fill_form(state, LOG_TASK, f"User message:\n{state.get('user_message', '')}")


def edit_rca(state: RcaState) -> RcaState:
    return _fill_form(state, EDIT_TASK, f"User message:\n{state.get('user_message', '')}")


def extract_document(state: RcaState) -> RcaState:
    text = (state.get("source_text") or "")[:MAX_SOURCE_CHARS]
    note = state.get("user_message") or ""
    user_input = f"Document text:\n{text}" + (f"\n\nUser note: {note}" if note else "")
    return _fill_form(state, EXTRACT_TASK, user_input)


def build_graph():
    g = StateGraph(RcaState)
    g.add_node("router", router)
    g.add_node("log_rca", log_rca)
    g.add_node("edit_rca", edit_rca)
    g.add_node("extract_document", extract_document)
    g.set_entry_point("router")
    g.add_conditional_edges(
        "router",
        lambda s: s["intent"],
        {"log_rca": "log_rca", "edit_rca": "edit_rca", "extract_document": "extract_document"},
    )
    for node in ("log_rca", "edit_rca", "extract_document"):
        g.add_edge(node, END)
    return g.compile()


rca_graph = build_graph()
