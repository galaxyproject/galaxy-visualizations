from polaris.core.client import http

from ..exceptions import ConfigurationError, ProviderError
from .api import API_METHODS, ApiOp, ApiProvider, ApiTarget
from .generic import openapi_get
from .openapi import OpenApiCatalog

ALLOWED_METHODS = [API_METHODS.GET]
PROVIDER_NAME = "galaxy"
PREFIXES = ["/api/histories", "/api/datasets", "/api/jobs", "/api/tools", "/api/workflows"]
DUMP_ENDPOINTS_PATH = None  # Set to a file path to dump discovered endpoints


class GalaxyApi(ApiProvider):
    def __init__(self, config):
        self.galaxy_root = config.get("galaxy_root")
        if not self.galaxy_root:
            raise ConfigurationError("galaxy_root missing")

        self.galaxy_key = config.get("galaxy_key")
        self.openapi = None

    async def init(self):
        try:
            spec = await http.request("GET", f"{self.galaxy_root}openapi.json")
            self.openapi = OpenApiCatalog(
                spec=spec,
                prefixes=PREFIXES,
                methods=ALLOWED_METHODS,
                dump_path=DUMP_ENDPOINTS_PATH,
            )
        except Exception as e:
            raise ProviderError(f"Failed to process OpenAPI schema: {e}") from e
        return self

    def target(self):
        return ApiTarget(
            name=PROVIDER_NAME,
            base_url=self.galaxy_root,
            auth=self._galaxy_auth,
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
        return ApiOp(
            target="galaxy",
            handler=openapi_get,
            capability="read",
            meta={
                "path": path,
                "operation": operation,
                "method": method,
            },
        )

    def _galaxy_auth(self, url):
        if self.galaxy_key:
            sep = "&" if "?" in url else "?"
            return f"{url}{sep}key={self.galaxy_key}"
        return url
