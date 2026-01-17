from polaris.modules.registry import Registry
from polaris.modules.runner import ProgressCallback, Runner


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
    """
    registry = Registry(config)
    await registry.init()
    registry.agents.register_agents(agents)
    agent = registry.agents.resolve_agent(name)
    runner = Runner(agent, registry, on_progress=on_progress)
    return await runner.run(inputs)
