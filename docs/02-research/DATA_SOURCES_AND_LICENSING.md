# Data sources and licensing

The tracked corpus consists of eight project-authored synthetic files under `datasets/samples/`, licensed by `datasets/LICENSE` (MIT). Seven have supported source extensions; one is intentionally unsupported. These are neither real repository observations nor representative model training data. No model has been trained or evaluated.

Public GitHub import accepts canonical `https://github.com/owner/repo` URLs, confirms public metadata, resolves the default branch to a 40-character commit SHA, and downloads the corresponding archive. Visibility does not grant redistribution rights. Users must establish licensing/permission for their chosen repository; imported sources and artifacts remain ignored locally. Phase I does not infer licenses or download a training corpus.

Tests use project-authored local ZIPs and httpx mocked GitHub responses, including rate limits, redirects and network failures. No CI test depends on GitHub being online.

Reference sources used for implementation decisions: [GitHub repository content API](https://docs.github.com/en/rest/repos/contents), [Tree-sitter Python grammar](https://github.com/tree-sitter/tree-sitter-python), [Tree-sitter Java releases](https://github.com/tree-sitter/tree-sitter-java/releases). Corpus statistics are calculated by the local pipeline, independently of these references.
