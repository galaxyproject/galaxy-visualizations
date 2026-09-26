"""Expression operators for agent pipelines."""

from collections.abc import Callable
from typing import Any

from olit.exceptions import ExpressionError

from .types import Context

# Type alias for expression definitions
ExprDict = dict[str, Any]
ResolveFunc = Callable[[Any, Context], Any]

# Comparisons a filter where-clause may carry, in the order they are looked for.
COMPARISONS = ("eq", "ne", "starts_with", "not_starts_with", "contains", "not_null", "in")


def _type_name(value: Any) -> str:
    """Get a readable type name for error messages."""
    if value is None:
        return "null"
    return type(value).__name__


def _require_list(items: Any, operator: str, parameter: str = "from") -> list:
    """A null source is the empty collection; anything else that is not a list is a fault.

    `$ref` refuses a path that is not there, so a non-list here is a real value of the wrong type
    rather than an unresolved reference, and swallowing it returned an empty answer about data that
    was never read.
    """
    if items is None:
        return []
    if not isinstance(items, list):
        raise ExpressionError(
            "Source is not an array",
            operator=operator,
            parameter=parameter,
            expected="list",
            received=_type_name(items),
        )
    return items


def _truncate(value: Any, max_len: int = 50) -> str:
    """Truncate a value for display in error messages."""
    s = repr(value)
    if len(s) > max_len:
        return s[: max_len - 3] + "..."
    return s


def expr_concat(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> str:
    """Concatenate multiple values into a string."""
    args = expr.get("args")
    if args is None:
        raise ExpressionError(
            "Missing required parameter",
            operator="concat",
            parameter="args",
            expected="list of values",
            hint="Usage: {op: concat, args: [value1, value2, ...]}",
        )
    if not isinstance(args, list):
        raise ExpressionError(
            "Invalid parameter type",
            operator="concat",
            parameter="args",
            expected="list",
            received=_type_name(args),
        )
    resolved = [resolve(a, ctx) for a in args]
    return "".join(str(a) for a in resolved)


def expr_coalesce(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> Any:
    """Return the first non-null value from a list."""
    args = expr.get("args")
    if args is None:
        raise ExpressionError(
            "Missing required parameter",
            operator="coalesce",
            parameter="args",
            expected="list of values",
            hint="Usage: {op: coalesce, args: [value1, value2, ...]}",
        )
    if not isinstance(args, list):
        raise ExpressionError(
            "Invalid parameter type",
            operator="coalesce",
            parameter="args",
            expected="list",
            received=_type_name(args),
        )
    for a in args:
        resolved = resolve(a, ctx)
        if resolved is not None:
            return resolved
    return None


def expr_get(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> Any:
    """Get a value from an object with a default fallback."""
    obj = resolve(expr.get("obj"), ctx)
    key = resolve(expr.get("key"), ctx)
    default = resolve(expr.get("default"), ctx)

    if key is None:
        raise ExpressionError(
            "Missing required parameter",
            operator="get",
            parameter="key",
            expected="string key name",
            hint="Usage: {op: get, obj: ..., key: 'fieldName', default: ...}",
        )

    if obj is None:
        return default

    if not isinstance(obj, dict):
        raise ExpressionError(
            "Object is not a mapping",
            operator="get",
            parameter="obj",
            expected="object",
            received=_type_name(obj),
        )

    return obj.get(key, default)


def expr_len(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> int:
    """Get the length of a list or string."""
    # Check if parameter exists (not just if value is truthy)
    if "arg" not in expr and "from" not in expr:
        raise ExpressionError(
            "Missing required parameter",
            operator="len",
            parameter="arg",
            expected="list or string",
            hint="Usage: {op: len, arg: {$ref: state.items}}",
        )

    arg = expr.get("arg") if "arg" in expr else expr.get("from")
    obj = resolve(arg, ctx)

    if obj is None:
        return 0
    if not hasattr(obj, "__len__"):
        raise ExpressionError(
            "Cannot get length of value",
            operator="len",
            parameter="arg",
            expected="list, string, or other sized type",
            received=_type_name(obj),
        )
    return len(obj)


def expr_eq(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> bool:
    """Check if two values are equal."""
    if "left" not in expr:
        raise ExpressionError(
            "Missing required parameter",
            operator="eq",
            parameter="left",
            hint="Usage: {op: eq, left: value1, right: value2}",
        )
    if "right" not in expr:
        raise ExpressionError(
            "Missing required parameter",
            operator="eq",
            parameter="right",
            hint="Usage: {op: eq, left: value1, right: value2}",
        )
    left = resolve(expr.get("left"), ctx)
    right = resolve(expr.get("right"), ctx)
    return left == right


def expr_not(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> bool:
    """Negate a boolean value."""
    if "arg" not in expr:
        raise ExpressionError(
            "Missing required parameter", operator="not", parameter="arg", hint="Usage: {op: not, arg: booleanValue}"
        )
    arg = resolve(expr.get("arg"), ctx)
    return not bool(arg)


def expr_lookup(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> Any:
    """Find an item in an array and return a field from it."""
    source = resolve(expr.get("from"), ctx)

    # lookup owes its caller a value, so it has no empty answer to give for a null source.
    if source is None:
        raise ExpressionError(
            "Source array is null",
            operator="lookup",
            parameter="from",
            expected="non-null array",
        )

    source = _require_list(source, "lookup")

    match = expr.get("match", {})
    if not match:
        raise ExpressionError(
            "Missing required parameter",
            operator="lookup",
            parameter="match",
            expected="{field: string, equals: value}",
            hint="Usage: {op: lookup, from: [...], match: {field: 'id', equals: value}, select: 'fieldName'}",
        )

    field = match.get("field")
    if not field:
        raise ExpressionError(
            "Missing match field",
            operator="lookup",
            parameter="match.field",
            expected="string field name",
            hint="Specify which field to match on: match: {field: 'id', equals: ...}",
        )

    equals = resolve(match.get("equals"), ctx)
    select = expr.get("select")

    if not select:
        raise ExpressionError(
            "Missing required parameter",
            operator="lookup",
            parameter="select",
            expected="string field name to return",
            hint="Specify which field to return: select: 'fieldName'",
        )

    for i, item in enumerate(source):
        if not isinstance(item, dict):
            continue
        if item.get(field) == equals:
            if select not in item:
                raise ExpressionError(
                    f"lookup select field not found: '{select}'",
                    operator="lookup",
                    parameter="select",
                    hint=f"Item at index {i} matched but doesn't have field '{select}'. Available fields: {list(item.keys())}",
                )
            return item[select]

    raise ExpressionError(
        f"lookup found no match for {field}={_truncate(equals)}",
        operator="lookup",
        hint=f"Searched {len(source)} items but none had {field}={_truncate(equals)}",
    )


def expr_count_where(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> int:
    """Count items in an array that match a condition."""
    items = _require_list(resolve(expr.get("from"), ctx), "count_where")
    field = expr.get("field")
    equals = resolve(expr.get("equals"), ctx)

    if not field:
        raise ExpressionError(
            "Missing required parameter",
            operator="count_where",
            parameter="field",
            expected="string field name",
            hint="Usage: {op: count_where, from: [...], field: 'status', equals: 'active'}",
        )

    return sum(1 for item in items if isinstance(item, dict) and item.get(field) == equals)


def expr_any(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> bool:
    """Check if any item in an array matches a condition."""
    items = _require_list(resolve(expr.get("from"), ctx), "any")
    field = expr.get("field")
    equals = resolve(expr.get("equals"), ctx)

    if not field:
        raise ExpressionError(
            "Missing required parameter",
            operator="any",
            parameter="field",
            expected="string field name",
            hint="Usage: {op: any, from: [...], field: 'status', equals: 'active'}",
        )

    return any(isinstance(item, dict) and item.get(field) == equals for item in items)


def expr_unique(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> list:
    """Deduplicate array items by a specified field, preserving order."""
    items = _require_list(resolve(expr.get("from"), ctx), "unique")
    by_field = expr.get("by")

    if not by_field:
        # No field specified - dedupe by entire item (for simple values)
        seen: set = set()
        result = []
        for item in items:
            key = item if not isinstance(item, dict) else id(item)
            if key not in seen:
                seen.add(key)
                result.append(item)
        return result

    # Dedupe by specific field
    seen_values: set = set()
    result = []
    for item in items:
        if isinstance(item, dict) and by_field in item:
            value = item[by_field]
            if value not in seen_values:
                seen_values.add(value)
                result.append(item)
    return result


def expr_select(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> list:
    """Project specific fields from array items."""
    items = _require_list(resolve(expr.get("from"), ctx), "select")
    fields = expr.get("fields", [])

    if not fields:
        return items

    if not isinstance(fields, list):
        raise ExpressionError(
            "Fields must be a list",
            operator="select",
            parameter="fields",
            expected="list of field names",
            received=_type_name(fields),
            hint="Usage: {op: select, from: [...], fields: ['id', 'name']}",
        )

    result = []
    for item in items:
        if isinstance(item, dict):
            result.append({k: item.get(k) for k in fields if k in item})
        else:
            result.append(item)
    return result


def expr_filter(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> list:
    """Filter array items by a condition."""
    items = _require_list(resolve(expr.get("from"), ctx), "filter")

    where = expr.get("where", {})
    if not where:
        return items

    field = where.get("field")
    if not field:
        raise ExpressionError(
            "Missing field in where condition",
            operator="filter",
            parameter="where.field",
            expected="string field name",
            hint="Usage: {op: filter, from: [...], where: {field: 'status', eq: 'active'}}",
        )

    # The clause is read before the walk, so an empty source cannot make a valid clause look missing.
    comparison = next((c for c in COMPARISONS if c in where and (c != "not_null" or where[c])), None)
    if comparison is None:
        raise ExpressionError(
            "No valid comparison operator in where condition",
            operator="filter",
            parameter="where",
            expected=f"one of: {', '.join(COMPARISONS)}",
            received=str(list(where.keys())),
            hint="Add a comparison: {field: 'name', eq: 'value'} or {field: 'name', starts_with: 'prefix'}",
        )

    against = resolve(where.get(comparison), ctx) if comparison in ("eq", "ne", "in") else where.get(comparison)

    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        value = item.get(field)

        if comparison == "eq":
            keep = value == against
        elif comparison == "ne":
            keep = value != against
        elif comparison == "starts_with":
            keep = isinstance(value, str) and value.startswith(against)
        elif comparison == "not_starts_with":
            keep = isinstance(value, str) and not value.startswith(against)
        elif comparison == "contains":
            keep = isinstance(value, str) and against in value
        elif comparison == "not_null":
            keep = value is not None
        else:
            keep = isinstance(against, list) and value in against

        if keep:
            result.append(item)

    return result


# Registry of all expression operators
EXPR_OPS: dict[str, Callable[[ExprDict, Context, ResolveFunc], Any]] = {
    "any": expr_any,
    "concat": expr_concat,
    "coalesce": expr_coalesce,
    "count_where": expr_count_where,
    "filter": expr_filter,
    "get": expr_get,
    "len": expr_len,
    "eq": expr_eq,
    "not": expr_not,
    "lookup": expr_lookup,
    "select": expr_select,
    "unique": expr_unique,
}


def get_available_operators() -> list[str]:
    """Return list of available expression operators."""
    return sorted(EXPR_OPS.keys())
