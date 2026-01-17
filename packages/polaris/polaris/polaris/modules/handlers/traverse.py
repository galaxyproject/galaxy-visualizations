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

        # Track fetched IDs (to avoid fetching same ID twice)
        fetched_ids: dict[str, set[str]] = {t: set() for t in types}
        # Track collected dedup values (to avoid duplicates in results)
        collected_dedup: dict[str, set[str]] = {t: set() for t in types}
        # Collected entities per type
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
        seed_dedup_field = seed_type_config.get("dedup_field", seed_id_field)
        seed_id = seed.get(seed_id_field)
        if not seed_id:
            return {
                "ok": False,
                "error": {
                    "code": ErrorCode.TRAVERSE_INVALID_CONFIG,
                    "message": f"Seed missing id field: {seed_id_field}",
                },
            }

        # Add seed to tracking sets and collected
        seed_dedup_value = seed.get(seed_dedup_field) or seed_id
        fetched_ids[seed_type].add(seed_id)
        collected_dedup[seed_type].add(seed_dedup_value)
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

                    # Extract related references (id + optional dedup value)
                    extract_pattern = rel_config.get("extract")
                    target_type_config = types.get(target_type, {})
                    target_id_field = target_type_config.get("id_field", "id")
                    target_dedup_field = target_type_config.get("dedup_field", target_id_field)

                    related_refs = self._extract_refs(
                        entity, extract_pattern, target_id_field, target_dedup_field
                    )

                    # Fetch each related entity
                    for ref in related_refs:
                        if items_added >= max_per_level:
                            break

                        rel_id = ref["id"]

                        # Skip if we've already fetched this ID (avoid redundant API calls)
                        if rel_id in fetched_ids[target_type]:
                            continue

                        # Fetch the entity
                        fetched = await self._fetch_entity(
                            target_type, rel_id, types, ctx, registry, runner
                        )
                        if fetched:
                            fetched_ids[target_type].add(rel_id)
                            actual_dedup = fetched.get(target_dedup_field) or rel_id

                            # Only add to collected if dedup value is new
                            if actual_dedup not in collected_dedup[target_type]:
                                collected_dedup[target_type].add(actual_dedup)
                                collected[target_type].append(fetched)

                            # Always add to frontier to traverse relations
                            # (even if not added to collected due to dedup)
                            next_frontier.append((target_type, fetched))
                            items_added += 1

            frontier = next_frontier

        # Build result - one list per entity type
        return {
            "ok": True,
            "result": collected,
        }

    def _extract_refs(
        self,
        entity: dict,
        pattern: str,
        id_field: str,
        dedup_field: str,
    ) -> list[dict[str, str]]:
        """
        Extract references (id + dedup value) from an entity using an extraction pattern.

        Returns list of dicts with 'id' and optional 'dedup' keys.
        This allows checking dedup values before fetching to avoid redundant API calls.

        Patterns:
        - Simple field: "creating_job" -> entity["creating_job"]
        - Nested glob: "inputs.*.id" -> extracts from entity["inputs"].values()
        """
        if not pattern:
            return []

        # Simple field path: "creating_job"
        if "." not in pattern and "*" not in pattern:
            value = entity.get(pattern)
            if value is None:
                return []
            if isinstance(value, str):
                return [{"id": value}]
            if isinstance(value, dict):
                if id_field in value:
                    ref = {"id": value[id_field]}
                    if dedup_field != id_field and dedup_field in value:
                        ref["dedup"] = value[dedup_field]
                    return [ref]
            return []

        # Glob pattern: "inputs.*.id" or "inputs.*"
        parts = pattern.split(".")
        current: Any = entity

        for i, part in enumerate(parts):
            if current is None:
                return []

            if part == "*":
                # Wildcard - iterate over dict values or list items
                remaining = ".".join(parts[i + 1:]) if i + 1 < len(parts) else ""
                results: list[dict[str, str]] = []

                items = []
                if isinstance(current, dict):
                    items = list(current.values())
                elif isinstance(current, list):
                    items = current

                for v in items:
                    if remaining:
                        # Continue extraction on nested value
                        nested_refs = self._extract_refs(
                            {"_": v}, f"_.{remaining}", id_field, dedup_field
                        )
                        results.extend(nested_refs)
                    elif isinstance(v, dict):
                        # Extract id and dedup from the object
                        if id_field in v:
                            ref = {"id": v[id_field]}
                            if dedup_field != id_field and dedup_field in v:
                                ref["dedup"] = v[dedup_field]
                            results.append(ref)
                    elif isinstance(v, str):
                        results.append({"id": v})
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
            return [{"id": current}]
        if isinstance(current, dict) and id_field in current:
            ref = {"id": current[id_field]}
            if dedup_field != id_field and dedup_field in current:
                ref["dedup"] = current[dedup_field]
            return [ref]
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

