# Phase IV synthetic pilot corpus

Eight original project-authored synthetic examples (four Python functions and four Java methods), with AI-authored reference summaries. These are **not GitHub data, human annotations, or a benchmark**. Original source strings are retained in `examples.json`; SHA-256 is over exact UTF-8 source bytes. The project contributes these snippets under the MIT license in `LICENSE`. No third-party source corpus has been imported.

Repository namespaces are synthetic grouping identifiers, not remote URLs. Version is `v1`. Four examples are training data, two validation, two test. No repository occurs in two splits. Code/whitespace-normalized near-duplicate checks run across the entire assembled corpus. These checks cannot rule out overlap with checkpoint pretraining. The tiny pilot is appropriate for pipeline smoke experiments only; results cannot establish general code understanding.

`nlp.dataset.prepare` validates schemas, language-specific syntax (Python AST; Java Tree-sitter method wrapper), source/name alignment, UTF-8 hashing, maximum length, missing/placeholder references, entity offsets, provenance and split isolation. SequenceMatcher ratio >=0.95 on whitespace-collapsed source flags near duplicates. Normalized text is used only for duplicate comparison; original code is not rewritten. Reference meaning still requires human review. An existing docstring is not automatically trustworthy.

NER is a separate annotation task over these sources, with three declaration categories. `review/candidate-labels.json` freezes regex weak labels and synthetic summary candidates. They are explicitly unreviewed. `review/sources.json` and `review/blank-labels.json` form the blind review package. See [annotation guidelines](ANNOTATION_GUIDELINES.md).

Prepare quality/split report: `.venv/bin/python -m experiments.phase4 prepare`.

Review status: **REVIEW_PENDING; 0 independently reviewed examples**. The independent evaluation command currently produces null metrics. Public dataset expansion and a suitably sized independent test corpus remain required for scientific quality claims.
