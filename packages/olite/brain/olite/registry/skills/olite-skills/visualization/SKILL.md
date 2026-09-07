---
name: visualization
description: Turn a tabular dataset into a chart through the vintent_dataset process.
when_to_use: the user asks to visualize, chart, plot, or graph a tabular dataset — histogram, scatter, bar chart, distribution, correlation, comparison, or trend
metadata:
  surfaces: [loom]
---

## Visualizing datasets

When the user asks to visualize, chart, plot, or graph a tabular dataset (for
example a histogram, scatter plot, bar chart, distribution, correlation, comparison,
or trend), call the `vintent_dataset` tool with inputs
`{dataset_id, request}`, where `request` is the user's phrasing. The process profiles
the data, chooses an appropriate chart, fills its fields, and returns the chart as a
rendered artifact. Prefer this over building a chart by hand with `run_python`.

The process picks the chart type and the encodings itself from the profile, so pass
the user's request through as-is rather than translating it into chart terms. It
returns a compact artifact reference, not the spec — the chart renders in the
artifact pane, so do not restate it in chat.

If the request names a column the data does not have, or the dataset has no columns
to plot, the process reports that rather than guessing. Relay the reason and ask for
a column that exists.
