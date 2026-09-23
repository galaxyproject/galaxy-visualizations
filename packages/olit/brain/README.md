# olit brain

The agent, a Python package run inside Pyodide. `runtime.run(config, inputs)` is the
entry the shell awaits; it builds a `Session` once per worker and runs turns against it.
See `../LAYOUT.md`. Built into a wheel by the package's `build:olit` script.
