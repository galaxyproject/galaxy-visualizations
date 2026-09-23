"""Ask the user to approve something mid-turn; no bridge means no approval."""

import json
import logging

logger = logging.getLogger(__name__)


class Confirmation:
    def __init__(self, ask=None):
        self._ask = ask

    @property
    def available(self):
        """Whether there is a user on the other end who could approve."""
        return self._ask is not None

    async def ask(self, title, message):
        """True only on explicit approval; denial, dismissal and errors all read no."""
        if self._ask is None:
            return False
        try:
            return bool(await self._ask(json.dumps({"title": title, "message": message})))
        except Exception:
            logger.warning("confirmation bridge unavailable", exc_info=True)
            return False


def from_js():
    """The worker-installed bridge, or an unavailable default."""
    try:
        from js import olitConfirm
    except ImportError:
        return Confirmation()
    return Confirmation(ask=olitConfirm)
