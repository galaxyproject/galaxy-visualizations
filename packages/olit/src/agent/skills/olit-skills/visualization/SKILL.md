---
name: visualization
description: Chart a dataset, either as a saved Galaxy visualization or inline through vega_dataset.
when_to_use: the user asks to visualize, chart, plot or graph a dataset, asks what a dataset can be displayed with, asks to open a dataset in a named viewer, or asks to change a visualization or add a track to one
metadata:
  surfaces: [loom]
---

## Two routes, and how to choose

The two routes produce different things, so the choice is about what the user gets rather than
which implementation runs.

**`save_visualization`** stores a durable Galaxy visualization: an object with its own URL that
the user keeps, can share, and can open outside this conversation. It binds the plugin's typed
inputs from Galaxy's metadata, so those columns must have been detected. **`show_visualization`**
displays the dataset with an installed visualization and saves nothing, rendering with the
plugin's defaults and binding no columns.

**`vega_dataset`** renders a Vega-Lite chart you write yourself, inline as an artifact, for a
chart no installed visualization covers. It points the spec at the dataset, so leave `data` out
of the spec entirely and refer to the columns as Galaxy names them, or `col:1`, `col:2` and so on
where it names none. The chart becomes no Galaxy object, and its reference works on this server
only, so a saved visualization is the better answer whenever one fits.

Choose by what the user asked for:

- The user asks to look at the dataset as an installed visualization renders it, for example
  "open this in IGV" or "chart these columns": **`show_visualization`**. Naming a
  visualization settles which one and it is never substituted silently; naming none makes it
  `list_visualizations` first. Nothing is saved, which is what asking to look at something asks
  for.
- The user asks to keep, save, share or come back to the chart: **`save_visualization`**. To
  change it afterwards, call it again with the `visualization_id` it returned; that revises the
  one visualization instead of adding another.
- Both take the same config and render it the same way; saving only keeps it in Galaxy. A
  visualization that needs columns, tracks or other values from the dataset is refused until the
  config supplies them: **`get_visualization_details`** for its schema and
  `get_visualization_options` for the values, then pass `settings` and `tracks`.
- No installed visualization fits, or the chart belongs in the record rather than the history:
  **`vega_dataset`**, then `update_page` with `{{artifact}}` where the chart belongs.
- A chart of something the dataset does not hold, such as a statistic Vega-Lite cannot express:
  run a Galaxy tool to produce the derived dataset, then chart that dataset. Do not compute the
  numbers yourself and hand them over as rows; `vega_dataset` refuses a spec carrying its own
  data, because a chart with no dataset behind it has no provenance.

## Where a result is kept

The page is where work is kept. A chart in the record sits with the question that prompted it and
the numbers behind it, and it is what a later session reads back. A saved visualization is a
separate object with its own URL, outside the record and outside the narrative.

So a result worth keeping goes into the page: `{{artifact}}` where it belongs in the content. Both
routes place their result that way, and the chart spec is not in your context, so the token is the
only way to place one.

This settles where a result goes, after the choice above has settled which route made it. A
visualization the user named keeps that plugin, and the page holds its settings, tracks and column
bindings whether or not it was saved.

Showing is still the default. Seeing a visualization is not a reason to keep it anywhere.

## Finding out what is available

`list_visualizations` takes a `dataset_id` and returns what this server can display it with. Call
it before saying anything about which visualizations exist. The installed set differs between
servers and changes over time, so it is never something to answer from memory.

It answers only that question. For the dataset's columns and their types, use
`get_dataset_details`. Read it before writing a `vega_dataset` spec: the columns it reports are
the names the spec may encode, and a name the dataset does not hold is refused.

For one visualization's parameters, use `get_visualization_details`. Each input comes back with
`stores`, the shape its value must take, and `options`, where its legal values come from. Call it
before binding anything, the way `get_tool_details` comes before `run_tool`.

`get_visualization_options` resolves an `options` source into the actual choices, whether they
come from a remote list, a Galaxy data table or the history. Choose one by its id, as Galaxy's form
does: pass `{"id": ...}` where the input stores an object and the id itself where it stores a
string, and the server stores the whole entry it names. Name the parameter by the `path` each input
publishes. Where that path crosses a conditional, pass `config` in the shape `save_visualization`
takes: the test parameter in it says which case is in play, so the same name under two
conditionals stays distinct.

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
dataset's metadata can be re-detected so the columns are recognised, or `vega_dataset` can
chart it as it stands, since it addresses the columns by position rather than by detected type.

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
dataset's datatype, and name what it does accept. `vega_dataset` reports when a
requested column does not exist. Relay the reason and ask for something that exists rather than
quietly producing a different chart.
