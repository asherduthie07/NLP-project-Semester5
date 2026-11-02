# Shared visualization data contracts

`frontend/src/viz/types.ts` is the source of truth. This page explains the rules around it.

## `VizModel`

A discriminated union over 12 kinds, chosen by `kind`: `bar`, `histogram`, `line`, `donut`, `radial`, `heatmap`, `scatter`, `treemap`, `sparkline`, `wordcloud`, `timeline`, `network`. Every model has `id`, `title`, an optional `description` and a required `provenance`.

## Provenance

| `kind` | Meaning | Chip |
|---|---|---|
| `measured` | Produced by a real analyzer run. `source` names the record, `snapshotId` when known | Measured |
| `demo` | The specified `shopflow-api` demo repository, not yet used at M1 | Demo data |
| `illustrative` | Sample values that exist only to show a chart kind | Illustrative |

Provenance is required by the type, shown on every chart, and written into the first line of CSV exports.

## `VizState`

| `status` | Shown as |
|---|---|
| `loading` | Skeleton |
| `empty` | "No data" with the reason |
| `error` | Alert with the message and Retry. **Never sample data** |
| `unavailable` | Named later-phase capability, such as "Not evaluated" for NER scores before Phase IV |
| `ready` | The chart, or "No data" if the model has no values |

## Backend mapping (`viz/adapters/backend.ts`)

| Backend field (`ExploratoryStatistics`) | Model | Rule |
|---|---|---|
| `languages`, `token_types`, `naming_patterns` | Donut | Counts unchanged |
| `identifiers` | Word cloud, corpus `code-identifiers` | Top 60, counts unchanged |
| `documentation_terms` | Word cloud, corpus `documentation-terms` | Kept apart from code identifiers |
| `token_frequencies` | Not used for word charts | It includes punctuation and keywords |
| `function_lengths`, `class_sizes`, comment and docstring lengths | Histogram | Binned with no value dropped |
| Fan-in and fan-out | Scatter | Empty corpus data reports as empty |
| Documentation by symbol kind | Stacked bar | Counts unchanged |
| `DependencyGraph` nodes and edges | Network | Unresolved relationships are counted, never drawn to a guessed target. Source spans carry through to tooltips |

## Demo and live data

M1 has no live data fetching. The showcase shows real Phase II statistics by importing `docs/07-findings/phase-2/analysis.json` at build time, labelled Measured. Those figures describe the 7-file synthetic fixture corpus, not a real repository.

The "Demo Mode / Live Mode" control from Phase III §7 is not built. It belongs with the dashboard shell at M2. The contract it must follow is already enforced: a failed request becomes `status: 'error'`, and nothing in the system substitutes sample data.

## Datum IDs

`datumIds(model)` lists every addressable point. Bars use `category|series`, heatmaps `x:y`, and other kinds use their item `id`. Tooltips, selection, the keyboard path and 3D picking all use these same IDs, which is why selection survives a mode switch.
