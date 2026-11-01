# Phase II independent review package

Status: **REVIEW_PENDING**. Reviewed examples: **0**. All fixtures are project-authored synthetic MIT examples covered by `datasets/LICENSE`. They are never executed. No human review is claimed.

First read `GUIDELINES.md`, then inspect only `sources/` and fill `review/labels.json`. The blank form has the immutable source manifest but no predicted answers. Keep `candidates/` hidden until the reviewer finishes their first labeling pass. Candidate annotations are analyzer predictions and must never be copied to the approved reference without source inspection and documented correction/review.

Run `.venv/bin/python -m scripts.extraction_evaluation prepare` once to generate manifest, blank forms, JSON schema and frozen candidate predictions. Existing candidates/forms are never overwritten. Run `... evaluate` to generate current predictions and, when independent review has completed, score the signed reference. Before review the report has status REVIEW_PENDING and metrics null.

Submit corrected `review/labels.json`, `review/signoff.json` and `review/disagreements.json`. A reviewer must identify themselves, attest that labeling was independent and based on source, supply review time, the manifest hash and final labels SHA-256, then set status APPROVED and label provenance `independent_human`. A second reviewer/adjudicator should resolve disagreements; preserve original proposals and all corrected versions under distinct filenames. The tool checks recorded provenance, completeness and hashes; it cannot establish a person's identity or honesty. No approval is automatically fabricated.
