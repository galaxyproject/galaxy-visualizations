"""The scoped, capability-gated Galaxy API surface."""

import copy
import logging

from .catalog_sources import load_providers

logger = logging.getLogger(__name__)


class Catalog:
    def __init__(self, config, manifest):
        self.config = config
        self.manifest = manifest
        self._providers = []
        self._targets = {}
        self._load_error = None

    async def init(self):
        # Tolerant: if Galaxy/openapi is unreachable, the substrate still boots
        try:
            self._providers = await load_providers(self.config)
            for provider in self._providers:
                target = provider.target()
                self._targets[target.name] = target
        except Exception as e:
            logger.warning("catalog unavailable: %s", e)
            self._providers = []
            self._load_error = str(e)
        status = self.status()
        if status["loaded"]:
            logger.info("catalog loaded: %d ops (root=%s)", status["op_count"], self.config.get("galaxy_root"))
        else:
            logger.warning("catalog NOT loaded (root=%s): %s", self.config.get("galaxy_root"), self._load_error)
        return self

    def scoped(self, manifest):
        """A view gated by a narrower manifest, sharing the SAME loaded providers."""
        view = copy.copy(self)
        view.manifest = manifest
        return view

    def status(self):
        """Whether the catalog loaded, how many ops it holds, and any load error."""
        op_count = 0
        for provider in self._providers:
            catalog = getattr(provider, "openapi", None)
            if catalog is not None:
                op_count += len(catalog.index)
        return {"loaded": bool(self._providers), "op_count": op_count, "error": self._load_error}

    def _resolve(self, target_name):
        for provider in self._providers:
            op = provider.resolve_op(target_name)
            if op:
                return op
        return None

    async def call(self, target, input=None):
        """Call a catalog op by name (e.g. 'galaxy.histories.get')."""
        # Distinguish an unloaded spec from an unknown op.
        if not self._providers:
            return {
                "ok": False,
                "error": {
                    "code": "catalog_unavailable",
                    "message": self._load_error or "Galaxy OpenAPI catalog did not load",
                },
            }

        op = self._resolve(target)
        if not op:
            return {"ok": False, "error": {"code": "unknown_api_op", "message": target}}

        if not self.manifest.allows(op.capability):
            return {
                "ok": False,
                "error": {
                    "code": "capability_denied",
                    "message": target,
                    "capability": op.capability,
                },
            }

        provider_target = self._targets[op.target]
        try:
            result = await op.handler(provider_target, input or {}, op.meta)
            return {"ok": True, "result": result}
        except Exception as e:
            logger.warning("catalog call failed: %s - %s", target, e)
            return {"ok": False, "error": {"code": "api_call_failed", "message": str(e)}}

    def list_ops(self, query=None):
        """The callable op set, filtered to what the current manifest permits."""
        ops = []
        needle = (query or "").lower()
        for provider in self._providers:
            catalog = getattr(provider, "openapi", None)
            if catalog is None:
                continue
            prefix = provider.target().name
            for local_name, (path, operation, method) in catalog.index.items():
                name = f"{prefix}.{local_name}"
                resolved = provider.resolve_op(name)
                if not resolved or not self.manifest.allows(resolved.capability):
                    continue
                summary = operation.get("summary") or ""
                if needle and needle not in f"{name} {summary}".lower():
                    continue
                required = [p.get("name") for p in operation.get("parameters", []) if p.get("required")]
                ops.append(
                    {
                        "op": name,
                        "method": method,
                        "capability": resolved.capability,
                        "summary": summary,
                        "required_params": required,
                    }
                )
        ops.sort(key=lambda o: o["op"])
        return ops
