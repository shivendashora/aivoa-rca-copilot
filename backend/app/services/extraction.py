"""Turn uploaded PDFs / emails into plain text for the LLM."""
import email
from email import policy
from io import BytesIO

import pdfplumber


def extract_pdf_text(data: bytes) -> str:
    with pdfplumber.open(BytesIO(data)) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)


def extract_email_text(data: bytes) -> str:
    msg = email.message_from_bytes(data, policy=policy.default)
    body = msg.get_body(preferencelist=("plain", "html"))
    header = f"From: {msg['from']}\nSubject: {msg['subject']}\nDate: {msg['date']}\n\n"
    return header + (body.get_content() if body else "")
