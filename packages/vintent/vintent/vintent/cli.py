import argparse
import asyncio
import os
import vintent

from .config import config

# Get the package root directory
package_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


MESSAGE_INITIAL = "Hi, I can a pick a tool for you."
MESSAGE_USER = "Create a histogram of age"
PROMPT_DEFAULT = "Choose and parameterize one of the provided tools. YOU MUST choose a tool!"


async def main_async():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    run = sub.add_parser("run")
    run.add_argument("--query", required=False, default=MESSAGE_USER)
    args = parser.parse_args()
    if args.cmd == "run":
        inputs = {
            "transcripts": [
                {"content": PROMPT_DEFAULT, "role": "system"},
                {"content": MESSAGE_INITIAL, "role": "assistant"},
                {"content": args.query or MESSAGE_USER, "role": "user"},
            ]
        }
        dataset_path = os.path.join(package_root, "../test-data", "dataset.csv")
        reply = await vintent.run(config, inputs, dataset_path)
        print(reply)
    else:
        print("Unknown command:", args.cmd)


def main():
    asyncio.run(main_async())
