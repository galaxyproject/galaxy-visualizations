import logging
from typing import Any, Dict, List

from .pipeline import (
    DefaultCompletionsProvider,
    PipelineContext,
    create_default_pipeline,
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
        self.provider = DefaultCompletionsProvider(config)

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
                widgets: List of compiled visualization specs
                errors: List of structured error objects (if any errors occurred)
        """
        logger.debug(f"transcripts: {transcripts}")

        ctx = PipelineContext(
            transcripts=transcripts,
            file_name=file_name,
        )

        pipeline = create_default_pipeline()
        await pipeline.run(ctx, self.provider)

        return ctx.to_result()
