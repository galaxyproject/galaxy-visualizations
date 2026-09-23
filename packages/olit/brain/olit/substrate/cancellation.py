"""Stop, read from the AbortController the Pyodide worker owns."""

import logging

logger = logging.getLogger(__name__)


class Cancellation:
    def __init__(self, poll=None, signal=None):
        # `poll()` reports the flag; `signal` goes to fetch so requests drop in flight.
        self._poll = poll
        self.signal = signal

    @property
    def aborted(self):
        if self._poll is None:
            return False
        try:
            return bool(self._poll())
        except Exception:
            # The bridge is gone; a raise here would read as a crash, not a stop.
            logger.warning("cancellation bridge unavailable", exc_info=True)
            return False


def from_js():
    """The worker-installed bridge, or a never-aborting default."""
    try:
        from js import olitAborted, olitAbortSignal
    except ImportError:
        return Cancellation()
    return Cancellation(poll=olitAborted, signal=olitAbortSignal())
