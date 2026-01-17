"""Handler for traverse nodes - BFS graph traversal with targeted API calls."""

import logging
from typing import TYPE_CHECKING, Any

from ..constants import ErrorCode
from ..types import Context, NodeDefinition, Result

if TYPE_CHECKING:
    from ..registry import Registry

logger = logging.getLogger(__name__)

# Default limits
DEFAULT_MAX_DEPTH = 20
DEFAULT_MAX_PER_LEVEL = 20


class TraverseHandler:
    """
    Handler for traverse nodes - performs generic BFS graph traversal.

    Traverses a graph by following relations defined in the YAML configuration.
    Each entity type can define relations that point to other entity types,
    and the handler will fetch and collect all reachable entities.
    """

    async def execute(
        self,
        node: NodeDefinition,
        ctx: Context,
        registry: "Registry",
        runner: Any,
    ) -> Result:
        """Execute a traverse node."""
        try:
            # Parse configuration
            config = self._parse_config(node, ctx, runner)
            if not config["ok"]:
                return config

            cfg = config["config"]

            # Perform traversal
            result = await self._traverse(cfg, ctx, registry, runner)
            if not result["ok"]:
                return result

            # Apply emit
            ctx["result"] = result["result"]
            runner.resolver.apply_emit(node.get("emit"), result, ctx)

            return result

        except Exception as e:
            logger.exception("Traverse handler error")
            return {
                "ok": False,
                "error": {
                    "code": ErrorCode.TRAVERSE_FETCH_FAILED,
                    "message": str(e),
                },
            }

    def _parse_config(
        self, node: NodeDefinition, ctx: Context, runner: Any
    ) -> dict[str, Any]:
        """Parse and validate traverse configuration."""
        # Resolve seed
        seed_spec = node.get("seed")
        seed = runner.resolver.resolve(seed_spec, ctx)
        if not seed:
            return {
                "ok": False,
                "error": {
                    "code": ErrorCode.TRAVERSE_INVALID_CONFIG,
                    "message": "seed is required and must resolve to a value",
                },
            }

        seed_type = node.get("seed_type")
        if not seed_type:
            return {
                "ok": False,
                "error": {
                    "code": ErrorCode.TRAVERSE_INVALID_CONFIG,
                    "message": "seed_type is required",
                },
            }

        # Resolve limits
        max_depth = runner.resolver.resolve(node.get("max_depth"), ctx)
        if max_depth is None:
            max_depth = DEFAULT_MAX_DEPTH

        max_per_level = runner.resolver.resolve(node.get("max_per_level"), ctx)
        if max_per_level is None:
            max_per_level = DEFAULT_MAX_PER_LEVEL

        # Get entity type definitions
        types = node.get("types", {})
        if not types:
            return {
                "ok": False,
                "error": {
                    "code": ErrorCode.TRAVERSE_INVALID_CONFIG,
                    "message": "types configuration is required",
                },
            }

        return {
            "ok": True,
            "config": {
                "seed": seed,
                "seed_type": seed_type,
                "max_depth": max_depth,
                "max_per_level": max_per_level,
                "types": types,
            },
        }

    async def _traverse(
        self,
        cfg: dict[str, Any],
        ctx: Context,
        registry: "Registry",
        runner: Any,
    ) -> Result:
        """Perform BFS traversal."""
        seed = cfg["seed"]
        seed_type = cfg["seed_type"]
        max_depth = cfg["max_depth"]
        max_per_level = cfg["max_per_level"]
        types = cfg["types"]

        # Initialize visited sets and collections per type
        visited: dict[str, set[str]] = {t: set() for t in types}
        collected: dict[str, list[dict]] = {t: [] for t in types}

        # Get ID field for seed type
        seed_type_config = types.get(seed_type)
        if not seed_type_config:
            return {
                "ok": False,
                "error": {
                    "code": ErrorCode.TRAVERSE_INVALID_CONFIG,
                    "message": f"Unknown seed_type: {seed_type}",
                },
            }

        seed_id_field = seed_type_config.get("id_field", "id")
        seed_id = seed.get(seed_id_field)
        if not seed_id:
            return {
                "ok": False,
                "error": {
                    "code": ErrorCode.TRAVERSE_INVALID_CONFIG,
                    "message": f"Seed missing id field: {seed_id_field}",
                },
            }

        # Add seed to visited and collected
        visited[seed_type].add(seed_id)
        collected[seed_type].append(seed)

        # Initialize frontier: list of (entity_type, entity_data) tuples
        frontier: list[tuple[str, dict]] = [(seed_type, seed)]

        for depth in range(max_depth):
            if not frontier:
                break

            next_frontier: list[tuple[str, dict]] = []
            items_added = 0

            for entity_type, entity in frontier:
                if items_added >= max_per_level:
                    break

                type_config = types.get(entity_type)
                if not type_config:
                    continue

                # Process relations for this entity
                relations = type_config.get("relations", {})
                for rel_name, rel_config in relations.items():
                    if items_added >= max_per_level:
                        break

                    target_type = rel_config.get("type")
                    if not target_type or target_type not in types:
                        continue

                    # Extract related IDs
                    extract_pattern = rel_config.get("extract")
                    target_type_config = types.get(target_type, {})
                    related_ids = self._extract_ids(entity, extract_pattern, target_type_config)

                    # Fetch each related entity
                    for rel_id in related_ids:
                        if items_added >= max_per_level:
                            break
                        if rel_id in visited[target_type]:
                            continue

                        # Fetch the entity
                        fetched = await self._fetch_entity(
                            target_type, rel_id, types, ctx, registry, runner
                        )
                        if fetched:
                            visited[target_type].add(rel_id)
                            collected[target_type].append(fetched)
                            next_frontier.append((target_type, fetched))
                            items_added += 1

            frontier = next_frontier

        # Build result - one list per entity type
        return {
            "ok": True,
            "result": collected,
        }

    def _extract_ids(
        self, entity: dict, pattern: str, target_type_config: dict
    ) -> list[str]:
        """
        Extract IDs from an entity using an extraction pattern.

        Patterns:
        - Simple field: "creating_job" -> entity["creating_job"]
        - Nested glob: "inputs.*.id" -> [v["id"] for v in entity["inputs"].values()]
        """
        if not pattern:
            return []

        id_field = target_type_config.get("id_field", "id")

        # Simple field path: "creating_job"
        if "." not in pattern and "*" not in pattern:
            value = entity.get(pattern)
            if value is None:
                return []
            if isinstance(value, str):
                return [value]
            if isinstance(value, dict) and id_field in value:
                return [value[id_field]]
            return []

        # Glob pattern: "inputs.*.id" or "outputs.*.id"
        parts = pattern.split(".")
        current: Any = entity

        for i, part in enumerate(parts):
            if current is None:
                return []

            if part == "*":
                # Wildcard - iterate over dict values or list items
                remaining = ".".join(parts[i + 1:]) if i + 1 < len(parts) else ""
                results = []

                items = []
                if isinstance(current, dict):
                    items = list(current.values())
                elif isinstance(current, list):
                    items = current

                for v in items:
                    if remaining:
                        # Continue extraction on nested value
                        nested_ids = self._extract_ids(
                            {"_": v}, f"_.{remaining}", target_type_config
                        )
                        results.extend(nested_ids)
                    elif isinstance(v, dict) and id_field in v:
                        results.append(v[id_field])
                    elif isinstance(v, str):
                        results.append(v)
                return results
            else:
                if isinstance(current, dict):
                    current = current.get(part)
                else:
                    return []

        # End of pattern
        if current is None:
            return []
        if isinstance(current, str):
            return [current]
        if isinstance(current, dict) and id_field in current:
            return [current[id_field]]
        return []

    async def _fetch_entity(
        self,
        entity_type: str,
        entity_id: str,
        types: dict,
        ctx: Context,
        registry: "Registry",
        runner: Any,
    ) -> dict | None:
        """Fetch a single entity by ID."""
        type_config = types.get(entity_type)
        if not type_config:
            return None

        fetch_config = type_config.get("fetch")
        if not fetch_config:
            return None

        target = fetch_config.get("target")
        id_param = fetch_config.get("id_param", "id")

        try:
            result = await registry.call_api(
                ctx, {"target": target, "input": {id_param: entity_id}}
            )
            if result.get("ok"):
                return result.get("result")
            else:
                logger.warning(f"Failed to fetch {entity_type} {entity_id}: {result.get('error')}")
                return None
        except Exception as e:
            logger.warning(f"Error fetching {entity_type} {entity_id}: {e}")
            return None

