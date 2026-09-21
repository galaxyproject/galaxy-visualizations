"""One Galaxy call for a Python process, raising when it cannot go on."""


class ProcessError(Exception):
    """A Galaxy call the process cannot continue without."""

    def __init__(self, target, error):
        super().__init__(f"{target}: {error}")
        self.target, self.error = target, error


async def call(substrate, target, payload):
    result = await substrate.catalog.call(target, payload)
    if not result.get("ok"):
        raise ProcessError(target, result.get("error"))
    return result.get("result")
