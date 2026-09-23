from dataclasses import dataclass, field
from typing import Any, Optional
from collections.abc import Callable

from olit.exceptions import ConfigurationError, ProviderError

from .http import http
from .openapi import OpenApiCatalog
from .openapi_ops import openapi_get, openapi_post, openapi_put

GET, POST, PUT = "get", "post", "put"


@dataclass
class ApiOp:
    target: str
    handler: Callable
    capability: Optional[str] = None
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class ApiTarget:
    name: str
    base_url: str
    headers: Optional[Callable[[], dict[str, str]]] = None

    def build_url(self, path: str) -> str:
        return f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"

    def get_headers(self) -> dict[str, str]:
        if self.headers:
            return self.headers()
        return {}

ALLOWED_METHODS = (GET, POST, PUT)

# The only write ops the agent may reach, by catalog op name.
WRITE_ALLOWLIST = {
    "tools.post",  # run_tool
    "histories.post",  # create_history
    "dataset_collections.post",  # build a collection from datasets already in a history
    "histories.show.contents.bulk.put",  # change_datatype, add_tags and the other bulk operations
}
PROVIDER_NAME = "galaxy"
# The API paths the catalog indexes; anything else is unreachable through it.
PREFIXES = [
    "/api/histories",
    "/api/datasets",
    "/api/dataset_collections",
    "/api/jobs",
    "/api/tools",
    "/api/workflows",
    "/api/invocations",
    "/api/pages",
    "/api/users",
    "/api/configuration",
    "/api/version",
    "/api/whoami",
]


class GalaxyApi:
    def __init__(self, config):
        self.galaxy_root = config.get("galaxy_root")
        if not self.galaxy_root:
            raise ConfigurationError("galaxy_root missing")

        self.galaxy_key = config.get("galaxy_key")
        self.openapi = None

    async def init(self):
        url = f"{self.galaxy_root}openapi.json"
        try:
            spec = await http.request("GET", url)
            self.openapi = OpenApiCatalog(spec=spec, prefixes=PREFIXES, methods=ALLOWED_METHODS)
        except Exception as e:
            raise ProviderError(f"Failed to load OpenAPI schema from {url}: {e}") from e
        return self

    def target(self):
        return ApiTarget(
            name=PROVIDER_NAME,
            base_url=self.galaxy_root,
            headers=self._galaxy_headers,
        )

    def resolve_op(self, name):
        prefix = f"{PROVIDER_NAME}."
        if not name.startswith(prefix):
            return None
        if self.openapi is None:
            return None
        local = name[len(prefix) :]
        resolved = self.openapi.get_op(local)
        if not resolved:
            return None
        path, operation, method = resolved
        if method == GET:
            handler, capability = openapi_get, "read"
        elif method in (POST, PUT):
            # Writes are targeted: only allowlisted ops resolve at all, per method.
            if local not in WRITE_ALLOWLIST:
                return None
            handler = openapi_post if method == POST else openapi_put
            capability = "write"
        else:
            return None
        return ApiOp(
            target="galaxy",
            handler=handler,
            capability=capability,
            meta={
                "path": path,
                "operation": operation,
                "method": method,
            },
        )

    def _galaxy_headers(self):
        if self.galaxy_key:
            return {"x-api-key": self.galaxy_key}
        return {}
