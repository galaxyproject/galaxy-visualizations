---
name: visualization
description: Chart a dataset, either inline through vintent_dataset or as a saved Galaxy visualization.
when_to_use: the user asks to visualize, chart, plot or graph a dataset, asks what a dataset can be displayed with, asks to open a dataset in a named viewer, or asks to change a visualization or add a track to one
metadata:
  surfaces: [loom]
---

## Two routes, and how to choose

Galaxy can display a dataset in two different ways, and they are not interchangeable.

**`vintent_dataset`** profiles a tabular dataset, picks a chart and its encodings, and renders it
inline as an artifact. It reads the file contents, so it works even when Galaxy has not detected
the columns. It is tabular-only. The chart becomes no Galaxy object, and it can be written into a
page or notebook as `{{artifact}}`, which is how it is kept.

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
- The user asks to keep, save, share or come back to the chart, and named no visualization:
  **`vintent_dataset`**, then `update_page` with `{{artifact}}` where the chart belongs.
  Naming a visualization settles the route first; keeping it is **`save_visualization`**.
- A named visualization that has to bind particular columns, settings or tracks:
  **`get_visualization_details`** for its schema, then **`save_visualization`**. Galaxy renders a
  displayed visualization from the dataset alone, so settings only survive in a saved config. To change them afterwards, call it again with the
  `visualization_id` it returned; that revises the one visualization instead of adding another.

## Where a result is kept

The page is where work is kept. A chart in the record sits with the question that prompted it and
the numbers behind it, and it is what a later session reads back. A saved visualization is a
separate object with its own URL, outside the record and outside the narrative.

So a result worth keeping goes into the page: `{{artifact}}` where it belongs in the content. Both
routes place their result that way, and the chart spec is not in your context, so the token is the
only way to place one.

This settles where a result goes, after the choice above has settled which route made it. A
visualization the user named keeps that plugin: `save_visualization` holds the settings, tracks and
column bindings that survive only in a saved config, and the page can hold it as well.

Showing is still the default. Seeing a visualization is not a reason to keep it anywhere.

## Finding out what is available

`list_visualizations` takes a `dataset_id` and returns what this server can display it with. Call
it before saying anything about which visualizations exist. The installed set differs between
servers and changes over time, so it is never something to answer from memory.

It answers only that question. For the dataset's columns and their types, use
`get_dataset_details`. A tabular chart does not need this call at all: `vintent_dataset` reads
the file and chooses its own encodings.

For one visualization's parameters, use `get_visualization_details`. Each input comes back with
`stores`, the shape its value must take, and `options`, where its legal values come from. Call it
before binding anything, the way `get_tool_details` comes before `run_tool`.

`get_visualization_options` resolves an `options` source into the actual choices, whether they
come from a remote list, a Galaxy data table or the history. Where a value is an object, pass the
one it returns through unchanged: it carries fields the plugin needs and rebuilding it from an id
produces something that looks right and does not load. A name a conditional declares in more than
one case needs `when` to say which case you mean.

`options` is what separates inputs that look alike. Two inputs can both take a dataset and accept
different datatypes: a genome takes a reference, a track takes the track formats. Match the
dataset to the `extension` list before using it. An input whose options come from a data table or
a URL names that source instead, and its value is chosen from there, not invented.

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

## Changing a saved visualization

`save_visualization` replaces the config; it does not merge into it. So revising one is three
steps, the same shape as editing a page:

1. `get_visualization` for its current `settings` and `tracks`.
2. Change or add what the user asked for, keeping the rest.
3. `save_visualization` with the same `visualization_id`, passing everything back.

Anything left out is gone. Adding a second track means sending both tracks, not only the new one.

For IGV specifically, start the visualization from the dataset alone and let the plugin work out
the genome and the first track. Add further datasets as entries in `tracks`, each naming its
dataset in `urlDataset`. `get_visualization_details` says which datatypes each input accepts, and
they differ: a genome takes a reference, a track takes the track formats.

## Neither tool guesses

Both tools refuse a visualization the server does not have, or one that does not accept the
dataset's datatype, and name what it does accept. `vintent_dataset` reports when a
requested column does not exist. Relay the reason and ask for something that exists rather than
quietly producing a different chart.
