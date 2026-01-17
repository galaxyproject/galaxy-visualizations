from typing import Any

from .exceptions import AgentError

AgentDefinition = dict[str, Any]


class Agents:
    def __init__(self) -> None:
        self.agents: dict[str, AgentDefinition] = {}

    def register_agent(self, agent_id: str, agent: AgentDefinition) -> None:
        if agent_id in self.agents:
            raise AgentError(f"Agent already registered: {agent_id}")
        self.agents[agent_id] = agent

    def register_agents(self, agents: dict[str, AgentDefinition]) -> None:
        for agent_id, agent in agents.items():
            self.register_agent(agent_id, agent)

    def resolve_agent(self, agent_id: str) -> AgentDefinition:
        agent = self.agents.get(agent_id)
        if not agent:
            raise AgentError(f"Unknown agent: {agent_id}")
        return agent
