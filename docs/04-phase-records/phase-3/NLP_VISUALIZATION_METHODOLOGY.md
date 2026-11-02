# NLP visualization methodology

Status: rules and shared components exist. The NLP analytics workspace (Phase III §4) is not built. It belongs to a later milestone.

## Rules enforced now

1. **Corpora stay separate.** Code identifiers and documentation terms are distinct word clouds with a `corpus` field. `token_frequencies` is not used for word charts because it mixes punctuation and keywords. A unit test checks this against the real Phase II file.
2. **Counts come from the record.** Adapters copy counts unchanged. Unit tests compare chart values with `docs/07-findings/phase-2/analysis.json`.
3. **Provenance is always visible.** Measured, Demo data or Illustrative appears on every chart and in CSV exports.
4. **Unmeasured results are not drawn.** NER, summarization and model scores render as `unavailable` ("Not evaluated") until Phase IV produces them.
5. **Position in a word cloud carries no data.** This is declared under the 3D chart. Word size is proportional to the square root of count, so area is linear in count.

## What the measured charts cover

They describe the 7-file synthetic Phase II fixture corpus: 205 tokens, 4 Python and 3 Java files. This corpus demonstrates the pipeline. It is too small for any general claim about code or language, and Phase II's extraction metrics remain pending human review.

## Phase II status

Phase II remains **PARTIAL / REVIEW_PENDING**. No chart presents provisional metrics as final, and none shows extraction precision, recall or F1.
