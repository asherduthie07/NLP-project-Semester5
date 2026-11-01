# Independent annotation guidelines, version 1

Review status is REVIEW_PENDING until a real reviewer has completed and signed the package. Initial candidates are machine predictions and are not gold. Do the first pass using only these guidelines, `sources/`, `annotation-schema.json`, and the blank `review/labels.json`. Do not inspect `candidates/` or current predictions until the first pass is saved under a new filename (for example `review/first-pass.json`).

## Scope and source identity

The seven MIT synthetic files cover nested classes/functions, async/static/class methods, constructors, fields, locals, parameters, aliases, interfaces, overloads, inheritance, local/unknown/ambiguous calls, circular imports and malformed syntax. `alpha` and `beta` import each other. `beta.outer` includes a duplicate function name. Java `Entity.find` has two overloads. `unicode.py` tests Unicode columns. Both Broken files are intentionally malformed.

Each file identity is its relative path, byte SHA-256 and language from `manifest.json`. `snapshot_hash` is SHA-256 of the canonical sorted manifest (`json.dumps(files, sort_keys=True)` encoded as UTF-8), independent of run-specific database UUIDs. Do not alter fixtures after labeling. A changed source requires a new manifest and review package. Existing candidate labels are immutable historical predictions, not reference input.

## Labeling symbols

Record category, fully qualified name, declaration span, textual signature and parameter names. Use 1-based lines and 0-based Unicode code-point columns, half-open spans, on the original decoded source. Exclude decorators from Python declaration start; include Java annotations/modifiers. Variables/fields use the identifier span, functions/classes use the whole declaration, modules use the whole source through EOF. Do not derive spans from parser predictions. For malformed source, label declarations with a clear name and bounded declaration span when source supports it; record uncertainty in the disagreement log rather than invent a body boundary.

Python module names derive from relative paths without `.py`, with slash replaced by dot and terminal `.__init__` removed. Append enclosing scope and declaration names. Methods belong directly to a class; `__init__` is a constructor. Variables belong to the lexical scope and class attributes are fields. Include parameter names and annotations in signature metadata and label every explicit parameter as category `parameter` with its identifier span and enclosing callable qualified name plus parameter name. Apply this rule to Java parameters too. Standalone parameter extraction is currently absent; these reference labels will expose false negatives rather than hiding the limitation.

Java classes use package plus enclosing class names. Methods/constructors append the complete parenthesized parameter declaration signature, including types, generics, names and varargs. Overloads must never merge. File modules use package plus filename stem. Imports retain source-level aliases in relationship alias metadata (Python `from` imports record imported name and optional alias as `name:alias`; comma join multiple names). Fields and local variables use the declaring scope. Do not claim Java type resolution from an invocation name alone.

## Labeling relationships

Record every containment, import, inheritance, implementation and call occurrence with its own source span and source symbol identity. Include a target symbol identity only for `confirmed` edges. `ambiguous` means multiple statically plausible targets; `unresolved` means no unique supported binding; `external` means the dependency names a module outside the snapshot. Target spelling, alias and status are part of the label. Preserve module imports even when they form a cycle; cycle detection is tested separately over confirmed import edges. Do not add dynamic/runtime edges. For generic inherited types record each separately supported base, and document unresolved generic binding rather than guessing.

Source and target identities embed the full symbol annotation so links can be validated without analyzer UUIDs. This strict protocol intentionally penalizes signature, scope, location, alias and resolution errors. Record optional/unsupported syntax decisions before evaluating, not after seeing the score. Reviewers should label what the declared scope requires, even where the extractor currently misses it.

## Sign-off and disagreements

After the blind pass, preserve it and compare candidate predictions. Record each disagreement with source evidence, original label, proposed correction, reviewer/adjudicator, reason and resolution. Never change reference annotations simply to match predictions. Keep all versions. If the first pass was correct, leave it unchanged. If annotation was wrong, document why and retain the old label.

Submit the final reference as `review/labels.json` with provenance `independent_human`. Complete sign-off only after source review of every file: reviewer identity, ISO date/time, independence attestation, all complete file paths, immutable manifest hash, SHA-256 of final labels bytes and zero unresolved disagreements. Set disagreement status RESOLVED (including an explicit empty record if there were none), and sign-off APPROVED. No automated/AI candidate generation constitutes this review. The tool validates the recorded attestations and hashes; actual independence requires human accountability.

Each disagreement entry must contain `id`, `file`, `source_evidence`, `original_label`, `proposed_label`, `reason`, `reviewer`, `adjudicator`, `decision`, `status` and `resolved_at`. Use distinct versioned files to preserve both passes and corrected labels. A self-declared empty disagreement list is not a substitute for source review.
