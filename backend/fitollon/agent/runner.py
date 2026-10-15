"""Runs one chat turn with the Strands agent and streams events for the web UI."""

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator
from typing import Any

from strands import Agent

from fitollon.agent.model import build_model
from fitollon.agent.prompt import build_system_prompt
from fitollon.agent.tools import ALL_TOOLS
from fitollon.config import get_settings
from fitollon.db import session_scope
from fitollon.models import Conversation

logger = logging.getLogger(__name__)


def _load_context(conversation_id: str | None) -> tuple[str, list[dict[str, Any]], str]:
    with session_scope() as session:
        conversation = session.get(Conversation, conversation_id) if conversation_id else None
        messages = conversation.messages if conversation else []
        return (conversation.id if conversation else str(uuid.uuid4())), messages, build_system_prompt(session)


def _save(conversation_id: str, title: str, messages: list[dict[str, Any]]) -> None:
    with session_scope() as session:
        conversation = session.get(Conversation, conversation_id)
        if conversation is None:
            session.add(Conversation(id=conversation_id, title=title, messages=messages))
        else:
            conversation.messages = messages


async def stream_chat(conversation_id: str | None, user_message: str) -> AsyncIterator[dict[str, Any]]:
    """Yields {"type": "conversation" | "text" | "tool" | "done" | "error", ...} events."""
    conversation_id, history, system_prompt = await asyncio.to_thread(_load_context, conversation_id)
    yield {"type": "conversation", "id": conversation_id}

    try:
        agent = Agent(
            model=build_model(get_settings()),
            tools=ALL_TOOLS,
            system_prompt=system_prompt,
            messages=history,
            callback_handler=None,
        )
        announced_tools: set[str] = set()
        async for event in agent.stream_async(user_message):
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

    title = user_message.strip().splitlines()[0][:80] or "New chat"
    await asyncio.to_thread(_save, conversation_id, title, agent.messages)
    yield {"type": "done"}
