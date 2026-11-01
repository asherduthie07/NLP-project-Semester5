# Phase I synthetic sample corpus

All files in `samples/` were authored for this project on 2026-11-01; none were acquired from GitHub. They are licensed under the adjacent MIT license. They demonstrate Python/Java classes, methods, nested Python definitions, imports, comments, docstrings, JavaDoc, Unicode, empty files, deliberate syntax errors, duplicate content and an unsupported text file. They are test inputs, not executable application modules.

Run `make corpus` to generate a manifest with hashes and actual preprocessing statistics. Do not execute the sample sources. The script reads them only. Imported user projects belong in ignored `storage/`, never in this tracked corpus.
