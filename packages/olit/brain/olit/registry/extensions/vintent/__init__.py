"""Vintent's pure leaves, absorbed into olit.

Profiler, data processes, chart shells, validation/compile logic, and the schema
builders, ported largely unchanged. All orchestration (Pipeline/Phase/Runner and
provider plumbing) is deliberately NOT here: olit's graph driver owns control
flow, LLM calls, state, and capabilities. See registry/vintent_bridge.py for how
these leaves are registered as olit materializers and schema-builders, and
processes/vintent_dataset.yml for the crystallized pipeline.
"""
