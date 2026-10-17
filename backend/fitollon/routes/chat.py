import base64
import binascii
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from fitollon.agent.runner import Image, stream_chat
from fitollon.auth import require_user
from fitollon.db import DbSession
from fitollon.models import ChatImage, Conversation

router = APIRouter(prefix="/api", dependencies=[Depends(require_user)])


# Photos arrive resized on the phone (a few hundred KB); Vercel caps the whole request at 4.5 MB.
MAX_IMAGES = 4
MAX_IMAGE_BYTES = 3 * 1024 * 1024


class ChatRequest(BaseModel):
    message: str = Field(default="", max_length=20000)
    conversation_id: str | None = None
    images: list[str] = Field(default_factory=list, max_length=MAX_IMAGES)  # base64

    @model_validator(mode="after")
    def has_content(self) -> "ChatRequest":
        if not self.message.strip() and not self.images:
            raise ValueError("Write a message or attach a photo")
        return self


def _image_format(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    return None


def _decode_images(encoded: list[str]) -> list[Image]:
    images = []
    for item in encoded:
        try:
            data = base64.b64decode(item, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A photo couldn't be read") from None
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "A photo is too large")
        image_format = _image_format(data)
        if image_format is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Photos must be JPEG, PNG, WebP or GIF")
        images.append((image_format, data))
    return images


@router.post("/chat")
async def chat(body: ChatRequest) -> StreamingResponse:
    """Streams newline-delimited JSON events: conversation, text, tool, done, error."""
    images = _decode_images(body.images)

    async def events() -> AsyncIterator[str]:
        async for event in stream_chat(body.conversation_id, body.message, images):
            yield json.dumps(event) + "\n"

    return StreamingResponse(
        events(), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache, no-transform"}
    )


@router.get("/conversations")
def list_conversations(session: Session = DbSession) -> list[dict]:
    rows = session.execute(
        select(Conversation.id, Conversation.title, Conversation.updated_at)
        .order_by(Conversation.updated_at.desc())
        .limit(100)
    ).all()
    return [{"id": r.id, "title": r.title, "updated_at": r.updated_at.isoformat()} for r in rows]


def _display_messages(messages: list[dict]) -> list[dict]:
    """Reduce the agent's history to what the chat UI shows: user text and photos, assistant text, tools used."""
    shown: list[dict] = []
    for message in messages:
        texts = [block["text"] for block in message.get("content", []) if block.get("text")]
        tools = [block["toolUse"]["name"] for block in message.get("content", []) if "toolUse" in block]
        if message.get("role") == "user":
            images = [
                ref
                for block in message.get("content", [])
                if (ref := block.get("image", {}).get("source", {}).get("chat_image")) is not None
            ]
            if texts or images:  # skip messages that only carry tool results
                shown.append({"role": "user", "text": "\n".join(texts), "tools": [], "images": images})
        elif shown and shown[-1]["role"] == "assistant":
            shown[-1]["text"] += "".join(texts)
            shown[-1]["tools"] += tools
        else:
            shown.append({"role": "assistant", "text": "".join(texts), "tools": tools})
    return shown


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str, session: Session = DbSession) -> dict:
    conversation = session.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return {"id": conversation.id, "title": conversation.title, "messages": _display_messages(conversation.messages)}


@router.get("/chat/images/{image_id}")
def chat_image(image_id: int, session: Session = DbSession) -> Response:
    image = session.get(ChatImage, image_id)
    if image is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
    # A photo never changes, so the browser keeps it.
    return Response(
        image.data,
        media_type=f"image/{image.format}",
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )


class RenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


@router.patch("/conversations/{conversation_id}")
def rename_conversation(conversation_id: str, body: RenameRequest, session: Session = DbSession) -> dict:
    title = " ".join(body.title.split())
    if not title:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The name can't be empty")
    # Setting updated_at to itself keeps the chat where it is in the list; renaming isn't new activity.
    renamed = session.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(title=title, updated_at=Conversation.updated_at)
    ).rowcount
    if not renamed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return {"id": conversation_id, "title": title}


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, session: Session = DbSession) -> dict:
    conversation = session.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    session.delete(conversation)
    return {"ok": True}
