from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional

from .http import http

from olite.exceptions import ConfigurationError, ProviderError
from .openapi_ops import openapi_get, openapi_post, openapi_put
from .openapi import OpenApiCatalog


class API_METHODS:
    GET = "get"
    POST = "post"
    PUT = "put"


@dataclass
class ApiOp:
    target: str
    handler: Callable
    capability: Optional[str] = None
    meta: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ApiTarget:
    name: str
    base_url: str
    headers: Optional[Callable[[], Dict[str, str]]] = None

    def build_url(self, path: str) -> str:
        return f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"

    def get_headers(self) -> Dict[str, str]:
        if self.headers:
            return self.headers()
        return {}

ALLOWED_METHODS = [API_METHODS.GET, API_METHODS.POST, API_METHODS.PUT]

# Targeted write allowlist: which POST ops may be reached at all (by catalog op
WRITE_ALLOWLIST = {
    "tools.post",  # run_tool
    "histories.post",  # create_history
    "dataset_collections.post",  # build a collection from datasets already in a history
    "histories.show.contents.show.tags.show.post",  # tag one dataset
    "histories.show.contents.bulk.put",  # change_datatype and the other bulk item operations
}
PROVIDER_NAME = "galaxy"
# Prefix allowlist scopes what the agent can reach. Widened past polaris's read
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
DUMP_ENDPOINTS_PATH = None  # Set to a file path to dump discovered endpoints


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
            self.openapi = OpenApiCatalog(
                spec=spec,
                prefixes=PREFIXES,
                methods=ALLOWED_METHODS,
                dump_path=DUMP_ENDPOINTS_PATH,
            )
        except Exception as e:
            raise ProviderError(f"Failed to load OpenAPI schema from {url}: {e}") from e
        return self

    def target(self):
        return ApiTarget(
            name=PROVIDER_NAME,
            base_url=self.galaxy_root,
            headers=self._galaxy_headers,
        )

    def ops(self):
        return {}

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
        if method == API_METHODS.GET:
            handler, capability = openapi_get, "read"
        elif method in (API_METHODS.POST, API_METHODS.PUT):
            # Writes are targeted: only allowlisted ops resolve at all, per method.
            if local not in WRITE_ALLOWLIST:
                return None
            handler = openapi_post if method == API_METHODS.POST else openapi_put
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
