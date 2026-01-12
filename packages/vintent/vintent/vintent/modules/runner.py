import logging
from typing import Any, Dict, List

from .pipeline import (
    DefaultCompletionsProvider,
    PipelineContext,
    RateLimitedCompletionsProvider,
    create_pipeline,
)
from .schemas import TranscriptMessageType

logger = logging.getLogger(__name__)


class Runner:
    """Orchestrates the visualization generation pipeline.

    This class provides a simple interface to run the visualization pipeline.
    For more control over individual phases, use the Pipeline class directly.
    """

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.provider = self._create_provider(config)
        self.pipeline_combine = config.get("ai_pipeline_combine", False)

    def _create_provider(self, config: Dict[str, Any]):
        """Create the completions provider, optionally with rate limiting."""
        provider = DefaultCompletionsProvider(config)
        rate_limit = config.get("ai_rate_limit")
        if rate_limit:
            logger.info(f"Rate limiting enabled: {rate_limit} requests/minute")
            provider = RateLimitedCompletionsProvider(provider, rate_limit)
        return provider

    async def run(
        self,
        transcripts: List[TranscriptMessageType],
        file_name: str,
    ) -> Dict[str, Any]:
        """Run the visualization pipeline.

        Args:
            transcripts: Conversation history with user messages
            file_name: Path to the CSV data file

        Returns:
            A dict with:
                logs: List of human-readable log messages
                spec: The compiled visualization spec (or None if compilation failed)
                errors: List of structured error objects (if any errors occurred)
        """
        logger.debug(f"transcripts: {transcripts}")
        logger.debug(f"pipeline_combine: {self.pipeline_combine}")

        ctx = PipelineContext(
            transcripts=transcripts,
            file_name=file_name,
        )

        pipeline = create_pipeline(self.pipeline_combine)
        await pipeline.run(ctx, self.provider)

        return ctx.to_result()
