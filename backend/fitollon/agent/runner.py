"""Runs one chat turn with the Strands agent and streams events for the web UI."""

import asyncio
import hashlib
import logging
import uuid
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session
from strands import Agent

from fitollon.agent.model import build_model
from fitollon.agent.prompt import build_system_prompt
from fitollon.agent.titles import fallback_title, generate_title
from fitollon.agent.tools import ALL_TOOLS
from fitollon.config import get_settings
from fitollon.db import session_scope
from fitollon.models import ChatImage, Conversation

logger = logging.getLogger(__name__)

Image = tuple[str, bytes]  # (format, data), e.g. ("jpeg", b"\xff\xd8...")


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _image_ref(block: dict[str, Any]) -> int | None:
    return block.get("image", {}).get("source", {}).get("chat_image")


def _with_photos(session: Session, messages: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Puts the stored photos back into the history, so the coach still sees them in follow-up questions.

    Also returns each photo's hash and id, so _save can turn them back into references afterwards."""
    ids = {ref for m in messages for block in m.get("content", []) if (ref := _image_ref(block)) is not None}
    images = {i.id: i for i in session.scalars(select(ChatImage).where(ChatImage.id.in_(ids)))} if ids else {}
    known: dict[str, int] = {}
    loaded = []
    for message in messages:
        content = []
        for block in message.get("content", []):
            ref = _image_ref(block)
            if ref is None:
                content.append(block)
            elif image := images.get(ref):
                known[_digest(image.data)] = image.id
                content.append({"image": {"format": image.format, "source": {"bytes": image.data}}})
            else:
                content.append({"text": "[A photo that is no longer available]"})
        loaded.append({**message, "content": content})
    return loaded, known


def _load_context(conversation_id: str | None) -> tuple[str, list[dict[str, Any]], dict[str, int], str]:
    with session_scope() as session:
        conversation = session.get(Conversation, conversation_id) if conversation_id else None
        messages, known = _with_photos(session, conversation.messages) if conversation else ([], {})
        return (conversation.id if conversation else str(uuid.uuid4())), messages, known, build_system_prompt(session)


def _save(conversation_id: str, title: str, messages: list[dict[str, Any]], known: dict[str, int]) -> None:
    """Stores the history with each photo saved once in chat_images and referenced by id."""
    with session_scope() as session:
        conversation = session.get(Conversation, conversation_id)
        if conversation is None:
            conversation = Conversation(id=conversation_id, title=title, messages=[])
            session.add(conversation)
            session.flush()  # the photos below point at it
        stored = []
        for message in messages:
            content = []
            for block in message.get("content", []):
                data = block.get("image", {}).get("source", {}).get("bytes")
                if data is None:
                    content.append(block)
                    continue
                image_format = block["image"]["format"]
                digest = _digest(data)
                if digest not in known:
                    image = ChatImage(conversation_id=conversation_id, format=image_format, data=data)
                    session.add(image)
                    session.flush()
                    known[digest] = image.id
                content.append({"image": {"format": image_format, "source": {"chat_image": known[digest]}}})
            stored.append({**message, "content": content})
        conversation.messages = stored


async def _title(naming: asyncio.Task[str] | None, fallback_source: str) -> str:
    if naming is None:
        return fallback_title(fallback_source)
    try:
        return await asyncio.wait_for(naming, timeout=20)
    except TimeoutError:
        logger.warning("chat title generation timed out")
        return fallback_title(fallback_source)


async def stream_chat(
    conversation_id: str | None, user_message: str, images: list[Image] | None = None
) -> AsyncIterator[dict[str, Any]]:
    """Yields {"type": "conversation" | "text" | "tool" | "done" | "error", ...} events."""
    conversation_id, history, known, system_prompt = await asyncio.to_thread(_load_context, conversation_id)
    yield {"type": "conversation", "id": conversation_id}
    # A new chat gets its name written alongside the first reply, so naming adds no wait.
    naming = asyncio.create_task(generate_title(user_message)) if not history and user_message.strip() else None
    prompt: str | list[dict[str, Any]] = user_message
    if images:
        prompt = [{"text": user_message}] if user_message.strip() else []
        prompt += [{"image": {"format": image_format, "source": {"bytes": data}}} for image_format, data in images]

    try:
        try:
            agent = Agent(
                model=build_model(get_settings()),
                tools=ALL_TOOLS,
                system_prompt=system_prompt,
                messages=history,
                callback_handler=None,
            )
            announced_tools: set[str] = set()
            async for event in agent.stream_async(prompt):
                if event.get("data"):
                    yield {"type": "text", "text": event["data"]}
                elif tool_use := event.get("current_tool_use"):
                    tool_id = tool_use.get("toolUseId")
                    if tool_id and tool_id not in announced_tools:
                        announced_tools.add(tool_id)
                        yield {"type": "tool", "name": tool_use.get("name")}
        except Exception as exc:
            logger.exception("chat turn failed")
            yield {"type": "error", "message": str(exc) or exc.__class__.__name__}
            return

        title = await _title(naming, user_message.strip() or "Photo")
        await asyncio.to_thread(_save, conversation_id, title, agent.messages, known)
        yield {"type": "done"}
    finally:
        # The reply failed or the browser left: the turn isn't saved, so it needs no name.
        if naming and not naming.done():
            naming.cancel()
