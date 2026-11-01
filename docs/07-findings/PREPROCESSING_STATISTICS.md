# Actual synthetic corpus statistics

Command: `python -m scripts.sample_report` using the real collection/storage/preprocessing service. Machine-readable per-file evidence: `sample-preprocessing.json`.

| Metric | Actual count |
|---|---:|
| Supported files | 7 |
| Python files | 4 |
| Java files | 3 |
| Source lines | 65 |
| Comments (including JavaDoc, excluding Python docstrings) | 7 |
| Python docstrings | 10 |
| Lexical tokens | 205 |
| Distinct identifier spellings | 25 |
| Duplicate files after first byte-hash occurrence | 2 |
| Ignored files | 1 |
| Unsupported files | 1 |
| Error issues | 0 |
| Warning issues | 5 |

The ten docstrings include the duplicate Python file; counts describe imported records rather than deduplicated content. Two duplicate links arise from the duplicated catalog and the pair of empty files. Malformed syntax is represented as warnings and retained lexical evidence, not silently corrected or represented as successful semantic parsing. Warning codes and per-file counts are available in the JSON. These descriptive counts belong to Phase I dataset quality inspection; distributions, dependency analysis and dashboards remain Phase II/III work.
