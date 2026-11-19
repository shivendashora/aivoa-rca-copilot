from typing import TypedDict


class RcaState(TypedDict, total=False):
    user_message: str
    source_text: str
    intent: str            # log_rca | edit_rca | extract_document
    fields: list[dict]     # form definition: [{name, description, type}] from services.forms
    form: dict             # current RCA form values, keyed by field name
    changed_fields: list[str]
    reply: str
