"""CLI for the dataset_report agent."""

import argparse
import asyncio
import json
import logging
import sys

from .postprocess import postprocess


def parse_inputs(input_args: list[str]) -> dict:
    """Parse key=value input arguments into a dictionary."""
    inputs = {}
    for arg in input_args:
        if "=" not in arg:
            raise ValueError(f"Invalid input format: '{arg}' (expected key=value)")
        key, value = arg.split("=", 1)
        # Try to convert to int
        try:
            inputs[key] = int(value)
        except ValueError:
            inputs[key] = value
    return inputs


def setup_logging(verbose: bool = False) -> None:
    """Configure logging for the CLI."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


async def run_agent(inputs: dict, verbose: bool = False) -> dict:
    """Run the dataset_report agent."""
    from polaris.config import load_config

    from . import run

    config = load_config().to_dict()

    def on_progress(event):
        if verbose:
            # Handle both dict and ProgressEvent
            if hasattr(event, "status"):
                logging.info(f"[{event.status}] {event.node_id}: {event.detail}")
            elif isinstance(event, dict):
                logging.info(f"[{event.get('status')}] {event.get('node_id')}: {event.get('detail')}")

    return await run(config, inputs, on_progress)


async def main_async():
    parser = argparse.ArgumentParser(
        description="Dataset Report Agent - Generate reports from Galaxy dataset lineage",
        epilog="Example: dataset-report dataset_id=abc123",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose logging",
    )
    parser.add_argument(
        "--raw",
        action="store_true",
        help="Output raw JSON (no formatting)",
    )
    parser.add_argument(
        "--diagram-only",
        action="store_true",
        help="Output only the Mermaid diagram",
    )
    parser.add_argument(
        "inputs",
        nargs="+",
        metavar="KEY=VALUE",
        help="Agent inputs (dataset_id required, depth and max_per_level optional)",
    )

    args = parser.parse_args()
    setup_logging(args.verbose)

    try:
        inputs = parse_inputs(args.inputs)
    except ValueError as e:
        logging.error(str(e))
        sys.exit(1)

    if "dataset_id" not in inputs:
        logging.error("dataset_id is required")
        sys.exit(1)

    logging.info(f"Running dataset report for: {inputs}")

    try:
        result = await run_agent(inputs, args.verbose)
    except Exception as e:
        logging.error(f"Agent execution failed: {e}")
        sys.exit(1)

    if not result.get("last", {}).get("ok"):
        error = result.get("last", {}).get("error", {})
        logging.error(f"Agent failed: {error.get('message', 'Unknown error')}")
        sys.exit(1)

    output = result["last"].get("result", result["last"])

    if args.diagram_only:
        print(output.get("mermaid_diagram", ""))
    elif args.raw:
        print(json.dumps(output))
    else:
        print(json.dumps(output, indent=2))

    logging.info("Done")


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
