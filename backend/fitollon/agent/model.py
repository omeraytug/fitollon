from strands.models import CacheConfig, Model

from fitollon.config import Settings

ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5"


class ModelNotConfigured(RuntimeError):
    pass


def build_model(settings: Settings) -> Model:
    """Create the LLM for the coach. Switch providers with MODEL_PROVIDER; no other code changes needed."""
    if settings.model_provider == "openai":
        # The Responses API, not Chat Completions: newer reasoning models only accept tools there.
        # Stateless (the default), since the full history is stored in our own database.
        from strands.models.openai_responses import OpenAIResponsesModel

        if not settings.openai_api_key:
            raise ModelNotConfigured("OPENAI_API_KEY is not set.")
        if not settings.model_id:
            raise ModelNotConfigured(
                "MODEL_ID is not set. Run `uv run python -m fitollon.cli models` to list the models your key can use."
            )
        return OpenAIResponsesModel(
            client_args={"api_key": settings.openai_api_key},
            model_id=settings.model_id,
            params=settings.model_params,
        )

    from strands.models.anthropic import AnthropicModel

    if not settings.anthropic_api_key:
        raise ModelNotConfigured("ANTHROPIC_API_KEY is not set.")
    return AnthropicModel(
        client_args={"api_key": settings.anthropic_api_key},
        model_id=settings.model_id or ANTHROPIC_DEFAULT_MODEL,
        max_tokens=64000,
        # Adaptive thinking with medium effort suits a chat coach; override via MODEL_PARAMS.
        params={"thinking": {"type": "adaptive"}, "output_config": {"effort": "medium"}, **settings.model_params},
        cache_config=CacheConfig(ttl="5m"),
    )
