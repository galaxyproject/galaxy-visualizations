"""Graph driver: run a crystallized agent.yml process over the substrate."""

from .registry import Registry
from .runner import Runner


class GraphDriver:
    def __init__(self, substrate):
        self.substrate = substrate
        self.registry = Registry(substrate)

    async def run(self, graph, inputs, agents=None, on_progress=None):
        """Execute a parsed agent.yml graph. Returns {state, last}."""
        if agents:
            self.registry.agents.register_agents(agents)
        runner = Runner(graph, self.registry, on_progress=on_progress)
        return await runner.run(inputs)
