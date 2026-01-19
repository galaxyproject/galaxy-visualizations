import logging

from polaris.modules.materializers import catalog as materializer_catalog
from polaris.modules.registry import Registry
from polaris.modules.runner import ProgressCallback, Runner

logger = logging.getLogger(__name__)

_initialized = False


def initialize() -> None:
    """Initialize the Polaris runtime.

    This function must be called once before any agent definitions are loaded
    or run() is called. It performs the following:

    1. Loads materializer functions from entry points
    2. Freezes the materializer catalog

    After initialization, the materializer catalog is immutable, ensuring that
    a given YAML always resolves to the same callable set.

    This function is idempotent - calling it multiple times has no effect
    after the first call.
    """
    global _initialized
    if _initialized:
        return

    materializer_catalog.load_entry_points()
    _initialized = True

    materializers = materializer_catalog.list_all()
    if materializers:
        logger.info(f"Polaris initialized. Materializers: {materializers}")
    else:
        logger.info("Polaris initialized. No materializers registered.")


def is_initialized() -> bool:
    """Check if the Polaris runtime has been initialized."""
    return _initialized


async def run(config, inputs, name, agents, on_progress: ProgressCallback | None = None):
    """Run an agent pipeline.

    Args:
        config: Configuration for the runtime (API endpoints, etc.)
        inputs: Input values for the agent
        name: Name of the agent to run
        agents: Dict mapping agent names to their definitions
        on_progress: Optional callback for progress updates

    Returns:
        Result dict containing state and last node output

    Raises:
        RuntimeError: If the runtime has not been initialized
    """
    if not materializer_catalog.is_frozen():
        raise RuntimeError(
            "Polaris runtime not initialized. Call polaris.initialize() first."
        )

    registry = Registry(config)
    await registry.init()
    registry.agents.register_agents(agents)
    agent = registry.agents.resolve_agent(name)
    runner = Runner(agent, registry, on_progress=on_progress)
    return await runner.run(inputs)
