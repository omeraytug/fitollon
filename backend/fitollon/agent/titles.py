"""Short chat names like "Protein on rest days", written by the model from the first message (as ChatGPT does)."""

import logging
import re
from typing import Any

from strands import Agent

from fitollon.agent.model import build_model
from fitollon.config import get_settings

logger = logging.getLogger(__name__)

PROMPT = (
    "You name conversations between a person and their fitness coach. Reply with only a title of 2 to 6 words "
    "that sums up what the person's message is about. Use sentence case and the message's language, with no "
    "quotes, emoji or ending punctuation."
)
MAX_LENGTH = 80


def fallback_title(message: str) -> str:
    """The first line of the message: used when the model can't be reached."""
    lines = message.strip().splitlines()
    return lines[0][:MAX_LENGTH] if lines else "New chat"


def first_user_text(messages: list[dict[str, Any]]) -> str | None:
    """The text of the first user message in a stored Strands history."""
    for message in messages:
        if message.get("role") == "user":
            texts = [block["text"] for block in message.get("content", []) if block.get("text")]
            if texts:
                return "\n".join(texts)
    return None


def _clean(text: str) -> str:
    title = re.sub(r"\s+", " ", text).strip().strip("\"'“”‘’`*#").strip()
    title = title.removeprefix("Title:").strip().rstrip(".!?:;,")
    return title[:MAX_LENGTH].strip()


async def generate_title(message: str) -> str:
    try:
        agent = Agent(model=build_model(get_settings()), system_prompt=PROMPT, tools=[], callback_handler=None)
        result = await agent.invoke_async(message[:4000])
        return _clean(str(result)) or fallback_title(message)
    except Exception:
        logger.warning("chat title generation failed", exc_info=True)
        return fallback_title(message)
