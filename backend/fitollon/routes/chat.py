import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from fitollon.agent.runner import stream_chat
from fitollon.auth import require_user
from fitollon.db import get_session
from fitollon.models import Conversation

router = APIRouter(prefix="/api", dependencies=[Depends(require_user)])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20000)
    conversation_id: str | None = None


@router.post("/chat")
async def chat(body: ChatRequest) -> StreamingResponse:
    """Streams newline-delimited JSON events: conversation, text, tool, done, error."""

    async def events() -> AsyncIterator[str]:
        async for event in stream_chat(body.conversation_id, body.message):
            yield json.dumps(event) + "\n"

    return StreamingResponse(
        events(), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache, no-transform"}
    )


@router.get("/conversations")
def list_conversations(session: Session = Depends(get_session)) -> list[dict]:
    rows = session.execute(
        select(Conversation.id, Conversation.title, Conversation.updated_at)
        .order_by(Conversation.updated_at.desc())
        .limit(100)
    ).all()
    return [{"id": r.id, "title": r.title, "updated_at": r.updated_at.isoformat()} for r in rows]


def _display_messages(messages: list[dict]) -> list[dict]:
    """Reduce the agent's history to what the chat UI shows: user and assistant text, plus tools used."""
    shown: list[dict] = []
    for message in messages:
        texts = [block["text"] for block in message.get("content", []) if block.get("text")]
        tools = [block["toolUse"]["name"] for block in message.get("content", []) if "toolUse" in block]
        if message.get("role") == "user":
            if texts:  # skip messages that only carry tool results
                shown.append({"role": "user", "text": "\n".join(texts), "tools": []})
        elif shown and shown[-1]["role"] == "assistant":
            shown[-1]["text"] += "".join(texts)
            shown[-1]["tools"] += tools
        else:
            shown.append({"role": "assistant", "text": "".join(texts), "tools": tools})
    return shown


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str, session: Session = Depends(get_session)) -> dict:
    conversation = session.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return {"id": conversation.id, "title": conversation.title, "messages": _display_messages(conversation.messages)}


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, session: Session = Depends(get_session)) -> dict:
    conversation = session.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    session.delete(conversation)
    return {"ok": True}
