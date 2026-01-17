import logging

logger = logging.getLogger(__name__)


class OpenApiCatalog:
    def __init__(self, spec, prefixes, methods=None, prefixture="api", placeholder="show", dump_path=None):
        self.index = {}
        self.methods = methods or ["get"]
        self.placeholder = placeholder
        self.prefixture = prefixture
        self.spec = spec
        for path, ops in spec.get("paths", {}).items():
            if not path.startswith(tuple(prefixes)):
                continue
            for method in self.methods:
                if method not in ops:
                    continue
                name = self._name_from_path(path) + f".{method}"
                self.index[name] = (path, ops[method], method)
        logger.info("OpenApiCatalog entries: %d", len(self.index))
        if dump_path:
            self.dump_endpoints(dump_path)

    def _name_from_path(self, path):
        parts = path.strip("/").split("/")
        if parts and parts[0] == self.prefixture:
            parts = parts[1:]
        out = []
        for p in parts:
            if p.startswith("{"):
                out.append(self.placeholder)
            else:
                out.append(p)
        return ".".join(out)

    def get_op(self, name):
        return self.index.get(name)

    def dump_endpoints(self, path):
        """Write all discovered endpoints to a text file for inspection."""
        with open(path, "w") as f:
            f.write("# Galaxy API Endpoints (discovered from OpenAPI spec)\n")
            f.write(f"# Total: {len(self.index)} endpoints\n\n")
            for name in sorted(self.index.keys()):
                api_path, operation, method = self.index[name]
                summary = operation.get("summary", "No description")
                f.write(f"## {name}\n")
                f.write(f"   Path: {method.upper()} {api_path}\n")
                f.write(f"   Summary: {summary}\n")
                # List parameters if available
                params = operation.get("parameters", [])
                if params:
                    f.write("   Parameters:\n")
                    for param in params:
                        param_name = param.get("name", "?")
                        param_in = param.get("in", "?")
                        required = param.get("required", False)
                        req_str = " (required)" if required else ""
                        f.write(f"     - {param_name} [{param_in}]{req_str}\n")
                f.write("\n")
        logger.info("Endpoints dumped to: %s", path)
