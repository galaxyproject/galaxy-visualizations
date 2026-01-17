from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional


class API_METHODS:
    GET = "get"
    POST = "post"


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


class ApiProvider:
    def target(self) -> ApiTarget:
        raise NotImplementedError

    def ops(self) -> Dict[str, ApiOp]:
        return {}

    def resolve_op(self, name: str) -> Optional[ApiOp]:
        return None
