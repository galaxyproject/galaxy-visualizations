import importlib
import pkgutil
from typing import Any, Dict

import vintent.modules.process.analyze as analyze_pkg
import vintent.modules.process.extract as extract_pkg
import vintent.modules.shells as shells_pkg
from vintent.modules.process import validate_process
from vintent.modules.shells.base import BaseShell


def _snake_to_camel(value: str) -> str:
    parts = [p for p in value.split("_") if p]
    return "".join(p[:1].upper() + p[1:] for p in parts)


def _discover(package, *, kind: str) -> Dict[str, Any]:
    registry: Dict[str, Any] = {}
    for _, module_name, _ in pkgutil.iter_modules(package.__path__):
        # Skip base module which contains the abstract base class
        if module_name == "base":
            continue
        module = importlib.import_module(f"{package.__name__}.{module_name}")
        if kind == "shell":
            class_name = f"{_snake_to_camel(module_name)}Shell"
            obj = getattr(module, class_name, None)
            if obj is None:
                raise ValueError(f"{module.__name__} missing expected class {class_name}")
            if not isinstance(obj, type) or not issubclass(obj, BaseShell):
                raise ValueError(f"{module.__name__}.{class_name} is not a BaseShell")
            if module_name in registry:
                raise ValueError(f"Duplicate shell id: {module_name}")
            registry[module_name] = obj()
        else:
            if kind == "process":
                proc = getattr(module, "PROCESS", None)
                if isinstance(proc, dict) and "id" in proc:
                    if proc["id"] in registry:
                        raise ValueError(f"Duplicate process id: {proc['id']}")
                    registry[proc["id"]] = validate_process(proc)
    return registry


class PROCESSES:
    ANALYZE = _discover(analyze_pkg, kind="process")
    EXTRACT = _discover(extract_pkg, kind="process")


SHELLS = _discover(shells_pkg, kind="shell")
