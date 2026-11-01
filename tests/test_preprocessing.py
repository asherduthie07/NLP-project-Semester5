import pytest

from analyzers.preprocessing import preprocess
from backend.codeatlas.contracts import Language, PreprocessingConfig, SourceFile
from backend.codeatlas.ingestion import decode_source, digest


def process(source, language="python", config=None, max_tokens=100000):
    raw = source.encode() if isinstance(source, str) else source
    _, encoding = decode_source(raw, Language(language))
    file = SourceFile(
        id="file-1",
        snapshot_id="snapshot-1",
        relative_path="a.py" if language == "python" else "A.java",
        language=language,
        content_hash=digest(raw),
        size_bytes=len(raw),
        encoding=encoding,
    )
    return preprocess(file, raw, config or PreprocessingConfig(), max_tokens)


def source_slice(source, span):
    lines = source.split("\n")
    if span.start.line == span.end.line:
        return lines[span.start.line - 1][span.start.column : span.end.column]
    selected = lines[span.start.line - 1 : span.end.line]
    selected[0] = selected[0][span.start.column :]
    selected[-1] = selected[-1][: span.end.column]
    return "\n".join(selected)


def test_python_tokens_comments_docstrings():
    source = '"""Module docs."""\n# comment\nclass Cart:\n    """Class docs."""\n    def add_item(self, price=2.5):\n        """Method docs."""\n        def nested():\n            """Nested docs."""\n            return "# not a comment"\n        return price + 1\n'
    result = process(source)
    assert result.statistics.docstrings == 4
    assert result.statistics.comments == 1
    assert result.analysis_status == "complete"
    assert {t.kind for t in result.tokens} >= {
        "string",
        "identifier",
        "keyword",
        "number",
        "operator",
        "punctuation",
        "comment",
    }
    assert any(t.text == "+" and t.kind == "operator" for t in result.tokens)
    assert any(s.text == "add item" for s in result.nlp_segments)
    assert result.normalized_source == source
    for token in result.tokens:
        assert source_slice(source, token.span) == token.text
        assert source.encode()[token.utf8_start : token.utf8_end].decode() == token.text


def test_java_javadoc_and_comment_markers_in_strings():
    result = process(
        '/** Adds values. */\nclass A { // inline\n int add(int a) { String s = "// string"; return a + 42; }\n}',
        "java",
    )
    assert [c.kind for c in result.comments] == ["javadoc", "comment"]
    assert result.statistics.docstrings == 0
    assert any(t.text == "42" and t.kind == "number" for t in result.tokens)
    assert any(t.text == "class" and t.kind == "keyword" for t in result.tokens)
    assert any(s.text == "Adds values." for s in result.nlp_segments)


@pytest.mark.parametrize(
    "language,source", [("python", "def broken(:\n  pass"), ("java", "class X { void x( {")]
)
def test_broken_syntax_retains_tokens(language, source):
    result = process(source, language)
    assert result.analysis_status == "warning" and result.tokens
    assert "syntax_error" in {i.code for i in result.issues}
    assert result.parsed_source == source


def test_unicode_newlines_and_locations():
    source = '# café 日本語\r\nπ = "héllo"; next_id = 2\r\n'
    result = process(source)
    assert result.parsed_source == source
    assert "\r" not in result.normalized_source
    for token in result.tokens:
        assert source_slice(source, token.span) == token.text
    assert next(t for t in result.tokens if t.text == "next_id").span.start.column == 13
    assert process(source).model_dump() == result.model_dump()


def test_encoding_and_empty_and_config():
    result = process(b"# coding: latin-1\r\n# caf\xe9\r\n")
    assert "café" in result.parsed_source
    assert process("").statistics.source_lines == 0
    assert process("").issues[0].code == "empty_file"
    config = PreprocessingConfig(normalize_newlines=False, split_identifiers=False)
    result = process("snake_case = 1\r\n", config=config)
    assert result.normalized_source.endswith("\r\n")
    assert result.nlp_segments[0].text == "snake_case"
    assert "newline_normalized" not in {i.code for i in result.issues}


def test_token_limit_explicit_error():
    result = process("a = 1\nb = 2", max_tokens=2)
    assert len(result.tokens) == 2 and result.analysis_status == "error"
    assert result.issues[-1].code == "token_limit"


def test_java_utf16_and_unicode_escape_warning():
    source = '/** Café */ class A { String s = "日本語"; }'
    result = process(source.encode("utf-16"), "java")
    assert result.parsed_source == source and result.encoding == "utf-16"
    escaped = process(r"class \u0041 {}", "java")
    assert "java_unicode_escape" in {i.code for i in escaped.issues}


def test_python_strings_and_multiline_span_are_preserved():
    source = '"""One line.\nSecond line."""\nvalue = "# inside a string"\n'
    result = process(source)
    assert len(result.comments) == 1 and result.comments[0].kind == "docstring"
    assert source_slice(source, result.comments[0].span) == result.comments[0].text
    assert all(segment.file_id == result.file_id for segment in result.nlp_segments)
