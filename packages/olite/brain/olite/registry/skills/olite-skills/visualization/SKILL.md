---
name: visualization
description: Chart a dataset, either inline through vintent_dataset or as a saved Galaxy visualization.
when_to_use: the user asks to visualize, chart, plot or graph a dataset, or asks what a dataset can be displayed with
metadata:
  surfaces: [loom]
---

## Two routes, and how to choose

Galaxy can display a dataset in two different ways, and they are not interchangeable.

**`vintent_dataset`** profiles a tabular dataset, picks a chart and its encodings, and renders it
inline as an artifact. It reads the file contents, so it works even when Galaxy has not detected
the columns. It is tabular-only and the chart is not saved to Galaxy.

**`show_visualization`** displays the dataset with an installed visualization and saves nothing.
It works for any datatype the server has a visualization for, not only tabular. It renders with
the plugin's defaults and cannot bind columns.

**`save_visualization`** does the same and also stores a durable Galaxy visualization: an object
with its own URL that the user keeps, can share, and can open outside this conversation. It binds
columns from Galaxy's metadata, so those columns must have been detected.

Choose by what the user asked for:

- Tabular data with no visualization named: **`vintent_dataset`**. This holds when the request
  names the columns to plot, as most do. vintent reads the file and chooses the encodings, so
  "plot Glucose against BMI" is still its job, not a reason to reach for a plugin.
- The user names a visualization, for example "make a Plotly chart" or "open this in IGV":
  **`show_visualization`** with that name. Never substitute a different one silently. If it
  cannot be used, say which one was asked for and why it cannot.
- A non-tabular datatype: **`show_visualization`**, since `vintent_dataset` cannot read it.
- The user asks to keep, save, share or come back to the chart: **`save_visualization`**.
- A named visualization that has to bind particular columns, settings or tracks:
  **`get_visualization_details`** for its schema, then **`save_visualization`**. Galaxy renders a
  displayed visualization from the dataset alone, so settings only survive in a saved config. To change them afterwards, call it again with the
  `visualization_id` it returned; that revises the one visualization instead of adding another.

Showing is the default. Seeing a visualization is not a reason to add one to the user's saved
visualizations, so reach for `save_visualization` only when the user asks to keep it, or when a
plugin they named needs settings that only a saved config can carry.

## Finding out what is available

`list_visualizations` takes a `dataset_id` and returns what this server can display it with. Call
it before saying anything about which visualizations exist. The installed set differs between
servers and changes over time, so it is never something to answer from memory.

It answers only that question. For the dataset's columns and their types, use
`get_dataset_details`. A tabular chart does not need this call at all: `vintent_dataset` reads
the file and chooses its own encodings.

For one visualization's parameters, use `get_visualization_details`. It returns the schema that
`settings` and `tracks` must match, built from the plugin's own XML, so the shape and the legal
values are stated rather than guessed. Call it before binding anything, the way
`get_tool_details` comes before `run_tool`. It is per visualization on purpose: carrying every
schema in the listing would send hundreds of times more than the one being used.

An entry marked `preferred_for_datatype` is the visualization the datatype itself declares, and is
the best default when the user has no preference.

## When the columns are missing

Some visualizations bind a column, listed as `column_parameters`. Galaxy can only fill those if it
detected the columns when the dataset was created. A file whose contents are comma-separated but
whose datatype is `tabular` often ends up with a single column of type `list`, and those
visualizations then cannot be parameterised.

`list_visualizations` says so when it happens. Relay the choice rather than working around it: the
dataset's metadata can be re-detected so the columns are recognised, or `vintent_dataset` can
chart it as it stands because it reads the contents directly.

## Neither tool guesses

Both tools refuse a visualization the server does not have, or one that does not accept the
dataset's datatype, and name what it does accept. `vintent_dataset` reports when a
requested column does not exist. Relay the reason and ask for something that exists rather than
quietly producing a different chart.
