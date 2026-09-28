"""Stop a turn re-reading a resource the watcher already owns.

loom: galaxy-poll-guard.ts, which holds the repeated read for two minutes before letting it
through. A browser turn that sleeps shows the user nothing and spends the wall clock the
cooldown exists to save, so here the repeat is answered instead of delayed.

Which resources are unfinished is the shell watcher's to say: the per-kind terminal states
live in `src/invocations.ts` and stay the only classifier. This guard is told what is being
watched and honours it.
"""

import time

COOLDOWN_SECONDS = 120

# The reads that ask a watched resource for its state, by the argument naming it.
RESOURCE_ARGUMENT = {
    "get_dataset_details": "dataset_id",
    "get_job_details": "dataset_id",
    "get_invocations": "invocation_id",
}


class GalaxyPollGuard:
    """Per-resource cooldown on the reads that ask a watched resource for its state."""

    def __init__(self, watching=None, clock=None):
        self._clock = clock or time.monotonic
        self._states = {}
        for entry in watching or []:
            if isinstance(entry, dict) and entry.get("id"):
                self._states[str(entry["id"])] = entry.get("state")
        self._read_at = {}

    def check(self, name, args):
        """Why this read buys nothing yet, or None to let it reach Galaxy."""
        resource = self._resource(name, args)
        if resource is None:
            return None
        last = self._read_at.get(resource)
        now = self._clock()
        if last is not None and now - last < COOLDOWN_SECONDS:
            return self._refusal(resource, COOLDOWN_SECONDS - (now - last))
        self._read_at[resource] = now
        return None

    def _resource(self, name, args):
        """The watched resource this call reads, or None when nothing is watching one."""
        argument = RESOURCE_ARGUMENT.get(name)
        if not argument or not isinstance(args, dict):
            return None
        held = args.get(argument)
        resource = str(held) if held else None
        return resource if resource in self._states else None

    def _refusal(self, resource, remaining):
        state = self._states.get(resource) or "unfinished"
        return (
            f"Refused: {resource} was {state} when it was last read, and the background "
            f"monitor is watching it -- you are told when it settles, without spending a call. "
            f"Reading it again cannot say anything new for another {int(remaining)}s."
        )
