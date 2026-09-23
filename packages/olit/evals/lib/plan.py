"""Parse a plan out of whatever the agent produced."""

import re

PLAN_HEADING = re.compile(
    r"^##\s+Plan\s+([^:]+):\s*(.+?)(?:\s*\[(local|galaxy|hybrid|remote)\])?\s*$",
    re.IGNORECASE,
)
# `- [ ] 1. **Name** — description`, tolerating the checkbox states the gate defines.
STEP = re.compile(r"^\s*-\s*\[([ x!])\]\s*(.*)$")


class ParsedPlan:
    def __init__(self, title, routing, steps):
        self.title = title
        self.routing = routing
        self.steps = steps

    @property
    def pending_steps(self):
        return [s for s in self.steps if s["state"] == " "]


def count_plans(content):
    """How many plan blocks the run produced. Re-drafting after approval is the defect."""
    if not content:
        return 0
    return sum(1 for line in content.splitlines() if PLAN_HEADING.match(line.strip()))


def parse_latest_plan(content):
    """The last plan section in `content`, or None."""
    if not content:
        return None
    lines = content.splitlines()

    start, title, routing = -1, "", "unknown"
    for i, line in enumerate(lines):
        m = PLAN_HEADING.match(line.strip())
        if m:
            start = i
            title = f"{m.group(1).strip()}: {m.group(2).strip()}"
            routing = (m.group(3) or "unknown").lower()
    if start == -1:
        return None

    steps = []
    for line in lines[start + 1:]:
        if PLAN_HEADING.match(line.strip()):
            break  # the next plan starts here
        m = STEP.match(line)
        if m:
            steps.append({"state": m.group(1), "text": m.group(2).strip()})
    return ParsedPlan(title, routing, steps)


def step_has_description(step_text, following):
    """Is this step described, or just named?"""
    if "—" in step_text or " – " in step_text:
        return True
    return any(line.strip().startswith(("- ", "* ")) for line in following)
