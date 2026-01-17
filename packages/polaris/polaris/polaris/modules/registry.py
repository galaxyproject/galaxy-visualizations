import json
import logging

from jsonschema import Draft7Validator

from polaris.core.completions import completions_post, get_tool_call
from polaris.core.rate_limiter import TokenBucketRateLimiter
from polaris.core.retry import retry_async

from .agents import Agents
from .api.api import API_METHODS
from .api.catalog import load_providers
from .exceptions import NodeExecutionError, PlannerError, RegistryError

logger = logging.getLogger(__name__)

# Retry configuration for reasoning
REASON_MAX_RETRIES = 3
REASON_INITIAL_BACKOFF = 2.0

# Default rate limit for LLM requests (requests per minute)
DEFAULT_RATE_LIMIT = 30


# ----------------------------
# Registry
# ----------------------------
class Registry:
    def __init__(self, config):
        self.config = config
        self.capabilities = ["llm", "read"]
        self.agents = Agents()
        self.api_targets = {}
        self.api_ops = {}
        # Rate limiter for LLM completions
        rate_limit = config.get("ai_rate_limit", DEFAULT_RATE_LIMIT)
        self._rate_limiter = TokenBucketRateLimiter.from_requests_per_minute(rate_limit)
        logger.info("Rate limiter initialized: %d requests/minute", rate_limit)

    async def init(self):
        self.providers = await load_providers(self.config)
        for provider in self.providers:
            # register target
            target = provider.target()
            target_name = target.name
            if target_name in self.api_targets:
                raise RegistryError(f"API target already registered: {target_name}")
            self.api_targets[target_name] = target
            # register ops
            for name, op in provider.ops().items():
                if name in self.api_ops:
                    raise RegistryError(f"API op already registered: {name}")
                if op.target not in self.api_targets:
                    raise RegistryError(f"API op '{name}' references unknown target '{op.target}'")
                self.api_ops[name] = op

    async def _completions_post(self, payload):
        """Rate-limited wrapper for completions_post."""
        await self._rate_limiter.acquire()
        return await completions_post(payload)

    # ----------------------------
    # Tool Builder
    # ----------------------------
    def build_route_tool(self, ctx, node, output_schema=None):
        if output_schema and output_schema.get("properties", {}).get("next", {}).get("enum"):
            next_enum = output_schema["properties"]["next"]["enum"]
        else:
            next_enum = list(ctx["graph"]["nodes"].keys())
        properties = {
            "next": {
                "type": "string",
                "enum": next_enum,
            }
        }
        required = {"next"}
        enum_from = node.get("enum_from")
        if enum_from and output_schema and isinstance(output_schema.get("required"), list):
            src = ctx["state"].get(enum_from["state"])
            if not isinstance(src, list):
                raise PlannerError(f"enum_from source is not an array: {enum_from['state']}")
            values = src
            filt = enum_from.get("filter")
            if filt:
                values = [v for v in values if v.get(filt["field"]) == filt["equals"]]
            enum_values = [v.get(enum_from["field"]) for v in values if isinstance(v.get(enum_from["field"]), str)]
            field = next(k for k in output_schema["required"] if k != "next")
            if not enum_values:
                raise PlannerError(f"No valid enum values for field '{field}' from state '{enum_from['state']}'")
            properties[field] = {
                "type": "string",
                "enum": enum_values,
            }
            required.add(field)
        return [
            {
                "type": "function",
                "function": {
                    "name": "route",
                    "description": "Select the next node and required identifiers.",
                    "parameters": {
                        "type": "object",
                        "required": list(required),
                        "properties": properties,
                        "additionalProperties": False,
                    },
                },
            }
        ]

    # ----------------------------
    # API dispatch
    # ----------------------------
    async def call_api(self, ctx, spec):
        op = self.api_ops.get(spec["target"])
        if not op:
            for provider in self.providers:
                op = provider.resolve_op(spec["target"])
                if op:
                    break
        if not op:
            return {
                "ok": False,
                "error": {
                    "code": "unknown_api_op",
                    "message": spec["target"],
                },
            }
        method = op.meta.get("method")
        if not method or method.lower() != API_METHODS.GET:
            return {
                "ok": False,
                "error": {
                    "code": "method_not_allowed",
                    "method": method,
                },
            }
        if op.capability and op.capability not in self.capabilities:
            return {
                "ok": False,
                "error": {
                    "code": "forbidden",
                    "message": spec["target"],
                },
            }
        target = self.api_targets[op.target]
        try:
            result = await op.handler(target, spec.get("input", {}), op.meta)
            return {"ok": True, "result": result}
        except Exception as e:
            return {
                "ok": False,
                "error": {
                    "code": "api_call_failed",
                    "message": str(e),
                },
            }

    # ----------------------------
    # Planner
    # ----------------------------
    async def plan(self, ctx, spec):
        system_prompt = spec.get(
            "prompt",
            "You are a routing component. You MUST call the provided tool. Do not respond with text.",
        )
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self.sanitize(ctx["inputs"].get("transcripts")))
        tools = self.build_route_tool(ctx, spec["node"], spec.get("output_schema"))
        tool_name = tools[0]["function"]["name"]
        reply = await self._completions_post(
            {
                **self.config,
                "messages": messages,
                "tools": tools,
                "tool_choice": {
                    "type": "function",
                    "function": {"name": tool_name},
                },
            }
        )
        choice = reply.get("choices", [{}])[0]
        arguments = get_tool_call(tool_name, reply)
        if not arguments:
            raise PlannerError(
                "Planner did not produce tool call",
                details={
                    "model": reply.get("model"),
                    "finish_reason": choice.get("finish_reason"),
                    "message": choice.get("message"),
                },
            )
        if spec.get("output_schema"):
            validator = Draft7Validator(spec["output_schema"])
            errors = list(validator.iter_errors(arguments))
            if errors:
                raise PlannerError(
                    "Planner output schema violation: " + "; ".join(e.message for e in errors)
                )
        return arguments

    # ----------------------------
    # Reason
    # ----------------------------
    async def reason(self, prompt, input):
        messages = [
            {
                "role": "user",
                "content": (
                    prompt
                    + "\n\n"
                    + "Respond with TEXT ONLY.\n"
                    + "Do not include JSON, markdown, or structured data.\n"
                    + "Do not include explanations about your reasoning process."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(input),
            },
        ]

        async def attempt_reasoning():
            reply = await self._completions_post(
                {
                    **self.config,
                    "messages": messages,
                }
            )

            # Validate response structure
            if not reply:
                raise NodeExecutionError("LLM returned empty response")

            choices = reply.get("choices")
            if not choices or not isinstance(choices, list) or len(choices) == 0:
                raise NodeExecutionError(
                    "LLM response missing choices",
                    details={"reply": str(reply)[:500]},
                )

            message = choices[0].get("message")
            if not message:
                raise NodeExecutionError(
                    "LLM response missing message",
                    details={"choice": str(choices[0])[:500]},
                )

            content = message.get("content")
            if not content or not content.strip():
                raise NodeExecutionError(
                    "Reasoning node produced empty output",
                    details={"message": str(message)[:500]},
                )

            return content

        def on_retry(e, attempt, backoff):
            logger.warning(
                "Reasoning failed: %s, retrying in %ss (attempt %d/%d)",
                e, backoff, attempt, REASON_MAX_RETRIES
            )

        try:
            return await retry_async(
                attempt_reasoning,
                max_retries=REASON_MAX_RETRIES,
                initial_backoff=REASON_INITIAL_BACKOFF,
                retryable=lambda e: not isinstance(e, NodeExecutionError),
                on_retry=on_retry,
            )
        except NodeExecutionError:
            raise
        except Exception as e:
            raise NodeExecutionError(
                f"Reasoning failed after {REASON_MAX_RETRIES} attempts: {e}"
            )

    # ----------------------------
    # Sanitization
    # ----------------------------
    def sanitize(self, transcripts):
        if not isinstance(transcripts, list):
            return []
        out = []
        for t in transcripts:
            content = t.get("content")
            if isinstance(content, str) and content:
                out.append({"role": t.get("role"), "content": content})
        return out
