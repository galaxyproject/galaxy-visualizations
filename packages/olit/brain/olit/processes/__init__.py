"""Processes: deterministic procedures the loop can invoke, and the registry over them.

A process is an async function declaring the `capabilities` it needs, which the session's
grant is intersected with when it runs. Each is advertised as a tool named after it.
"""

import inspect

_EMPTY = inspect.Parameter.empty
_TYPES = {
    str: "string",
    int: "integer",
    float: "number",
    bool: "boolean",
    list: "array",
}


class Process:
    def __init__(
        self,
        name,
        fn=None,
        description="",
        when_to_use="",
        capabilities=None,
        summarize=None,
    ):
        self.name = name
        self.fn = fn
        self.description = description
        self.when_to_use = when_to_use
        # What this process needs, intersected with the session's grant when it runs.
        self.capabilities = capabilities
        # How this process reduces its own state for the model, when a raw state is too large.
        self.summarize = summarize

    @property
    def inputs(self):
        """`{name: {type, required, default}}`, read from the signature."""
        out = {}
        for name, param in inspect.signature(self.fn).parameters.items():
            if name == "substrate":
                continue
            spec = {"type": _TYPES.get(param.annotation, "string")}
            if param.default is _EMPTY:
                spec["required"] = True
            elif param.default is not None:
                spec["default"] = param.default
            help_text = getattr(self.fn, "inputs_help", {}).get(name)
            if help_text:
                spec["help"] = help_text
            out[name] = spec
        return out

    async def run(self, substrate, inputs):
        """`{state, last}`, the shape the tool surface reads."""
        state = await self.fn(substrate, **(inputs or {}))
        return {"state": state, "last": {"ok": True, "result": state}}


class ProcessRegistry:
    def __init__(self):
        self._processes = {}

    def register_python(self, fn):
        """Register an async function carrying `capabilities` and `when_to_use` attributes."""
        name = fn.__name__
        doc = (fn.__doc__ or "").strip().split("\n")[0]
        self._processes[name] = Process(
            name,
            fn=fn,
            description=doc,
            when_to_use=getattr(fn, "when_to_use", ""),
            capabilities=getattr(fn, "capabilities", None),
            summarize=getattr(fn, "summarize", None),
        )
        return fn

    def load_packaged(self):
        """Every process this package declares."""
        for process in PROCESSES:
            self.register_python(process)
        return self

    def get(self, name):
        return self._processes.get(name)

    def names(self):
        return sorted(self._processes)

    def catalog_text(self):
        """Human-readable list of the registered processes."""
        lines = []
        for name in self.names():
            p = self._processes[name]
            hint = f" ({p.when_to_use})" if p.when_to_use else ""
            lines.append(f"- {name}: {p.description}{hint}")
        return "\n".join(lines)


from .lineage_report import lineage_report  # noqa: E402
from .organize_datasets import organize_datasets  # noqa: E402

PROCESSES = [lineage_report, organize_datasets]

__all__ = [
    "PROCESSES",
    "Process",
    "ProcessRegistry",
    "lineage_report",
    "organize_datasets",
]
