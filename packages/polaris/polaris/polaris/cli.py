import argparse
import asyncio
import json
import logging
import pathlib
import sys

import yaml  # type: ignore[import-untyped]
from pydantic import ValidationError

import polaris

from .config import load_config
from .modules.schema import validate_agent

logger = logging.getLogger(__name__)


def parse_input(value: str):
    """Parse an input value, converting to appropriate atomic type.

    Converts to int, float, or bool if possible, otherwise keeps as string.
    """
    # Boolean
    if value.lower() == "true":
        return True
    if value.lower() == "false":
        return False

    # Integer
    try:
        return int(value)
    except ValueError:
        pass

    # Float
    try:
        return float(value)
    except ValueError:
        pass

    # String
    return value


def parse_inputs(input_args: list[str]) -> dict:
    """Parse key=value input arguments into a dictionary.

    Args:
        input_args: List of "key=value" strings

    Returns:
        Dictionary of parsed inputs

    Raises:
        ValueError: If an argument is not in key=value format
    """
    inputs = {}
    for arg in input_args:
        if "=" not in arg:
            raise ValueError(f"Invalid input format: '{arg}' (expected key=value)")
        key, value = arg.split("=", 1)
        inputs[key] = parse_input(value)
    return inputs


def setup_logging(verbose: bool = False) -> None:
    """Configure logging for the CLI.

    Args:
        verbose: If True, set DEBUG level; otherwise INFO level
    """
    level = logging.DEBUG if verbose else logging.INFO
    format_str = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    if verbose:
        format_str = "%(asctime)s [%(levelname)s] %(name)s (%(filename)s:%(lineno)d): %(message)s"

    logging.basicConfig(
        level=level,
        format=format_str,
        datefmt="%H:%M:%S",
    )

    # Reduce noise from third-party libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def load_agents_from_dir(path: str, validate: bool = True) -> dict:
    """Load agent definitions from a directory.

    Args:
        path: Directory path containing .yml agent files
        validate: Whether to validate agents with Pydantic (default: True)

    Returns:
        Dictionary mapping agent IDs to agent definitions

    Raises:
        SystemExit: If validation fails and validate=True
    """
    agents = {}
    base = pathlib.Path(path)
    for p in base.glob("*.yml"):
        agent_id = p.stem
        with p.open("r") as f:
            raw_data = yaml.safe_load(f)

        if validate:
            try:
                validate_agent(raw_data)
                agents[agent_id] = raw_data  # Use raw dict for runner compatibility
                logger.info("Agent '%s' validated successfully", agent_id)
            except ValidationError as e:
                logger.error("Agent '%s' validation failed:", agent_id)
                for error in e.errors():
                    loc = ".".join(str(x) for x in error["loc"])
                    logger.error("  - %s: %s", loc, error["msg"])
                sys.exit(1)
        else:
            agents[agent_id] = raw_data
            logger.debug("Agent '%s' loaded (validation skipped)", agent_id)

    logger.info("Loaded %d agent(s) from %s", len(agents), path)
    return agents


async def main_async():
    parser = argparse.ArgumentParser(
        description="Polaris agent runner",
        epilog="Example: polaris run --agent report_generator dataset_id=abc123 depth=20",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose logging")
    sub = parser.add_subparsers(dest="cmd", required=True)

    # Run command
    run = sub.add_parser(
        "run",
        help="Run an agent",
        epilog="Inputs are passed as key=value pairs. Values are auto-converted to int, float, or bool when possible.",
    )
    run.add_argument("--agent", required=True, help="Agent ID to run")
    run.add_argument("--agents-dir", default="./agents", help="Directory containing agent YAML files")
    run.add_argument("--no-validate", action="store_true", help="Skip agent schema validation")
    run.add_argument("inputs", nargs="*", metavar="KEY=VALUE", help="Agent inputs as key=value pairs")

    # List command
    list_cmd = sub.add_parser("list", help="List available agents")
    list_cmd.add_argument("--agents-dir", default="./agents", help="Directory containing agent YAML files")

    args = parser.parse_args()
    setup_logging(args.verbose)

    if args.cmd == "run":
        try:
            inputs = parse_inputs(args.inputs)
        except ValueError as e:
            logger.error(str(e))
            sys.exit(1)

        agents = load_agents_from_dir(args.agents_dir, validate=not args.no_validate)

        if args.agent not in agents:
            logger.error("Agent '%s' not found. Available: %s", args.agent, ", ".join(agents.keys()))
            sys.exit(1)

        logger.info("Starting agent '%s' with inputs: %s", args.agent, inputs)
        config = load_config().to_dict()
        reply = await polaris.run(config, inputs, args.agent, agents)
        logger.info("Agent execution completed")
        print(json.dumps(reply.get("last"), indent=2))

    elif args.cmd == "list":
        agents = load_agents_from_dir(args.agents_dir, validate=False)
        for agent_id, agent_def in agents.items():
            desc = agent_def.get("description", "No description")
            inputs = list(agent_def.get("inputs", {}).keys())
            print(f"{agent_id}: {desc}")
            if inputs:
                print(f"  inputs: {', '.join(inputs)}")


def main():
    asyncio.run(main_async())
