"""Deterministic lexical preprocessing; never evaluates or imports submitted code."""

import ast
import keyword
import re
import sys
from importlib.metadata import version
from uuid import NAMESPACE_URL, uuid5

import tree_sitter_java
import tree_sitter_python
from tree_sitter import Language as Grammar
from tree_sitter import Node, Parser

from backend.codeatlas.contracts import (
    ExtractedComment,
    FileStatistics,
    Language,
    NlpSegment,
    PipelineIssue,
    Position,
    PreprocessingConfig,
    PreprocessingResult,
    SourceFile,
    Span,
    TokenRecord,
)
from backend.codeatlas.ingestion import decode_source

JAVA_KEYWORDS = set(
    "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record sealed permits yield non-sealed".split()
)
STRING_TYPES = {"string", "string_literal", "character_literal", "text_block", "concatenated_string"}
NUMBER_TYPES = {
    "integer",
    "float",
    "decimal_integer_literal",
    "hex_integer_literal",
    "octal_integer_literal",
    "binary_integer_literal",
    "decimal_floating_point_literal",
    "hex_floating_point_literal",
}
IDENTIFIERS = {"identifier", "type_identifier"}
COMMENT_TYPES = {"comment", "line_comment", "block_comment"}


def stable_id(*parts: str) -> str:
    return str(uuid5(NAMESPACE_URL, "codeatlas:" + ":".join(parts)))


def _walk(root: Node):
    # Iterative traversal also handles deeply nested malformed inputs.
    stack = [root]
    while stack:
        node = stack.pop()
        yield node
        stack.extend(reversed(node.children))


def _nlp(text: str, kind: str, config: PreprocessingConfig) -> str:
    if kind == "identifier" and config.split_identifiers:
        text = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text).replace("_", " ")
    elif config.filter_comment_markers and kind in {"comment", "javadoc"}:
        text = re.sub(r"(?m)^\s*(?:#|//|/\*+|\*+/|\*)\s?", "", text)
        text = re.sub(r"\*/\s*$", "", text)
    return " ".join(text.split())


def preprocess(
    file: SourceFile, data: bytes, config: PreprocessingConfig, max_tokens: int = 100000
) -> PreprocessingResult:
    max_tokens = min(max_tokens, config.max_tokens_per_file)
    config = config.model_copy(update={"max_tokens_per_file": max_tokens})
    source, encoding = decode_source(data, file.language)
    encoded = source.encode("utf-8")
    # Split only on LF: Tree-sitter rows count LF, not Unicode U+2028 or lone CR.
    source_lines = source.split("\n")
    starts = [0]
    for line in source_lines[:-1]:
        starts.append(starts[-1] + len(line.encode("utf-8")) + 1)

    def position(offset: int, row: int) -> Position:
        return Position(line=row + 1, column=len(encoded[starts[row] : offset].decode("utf-8")))

    def span(node: Node) -> Span:
        return Span(
            start=position(node.start_byte, node.start_point.row),
            end=position(node.end_byte, node.end_point.row),
        )

    def text(node: Node) -> str:
        return encoded[node.start_byte : node.end_byte].decode("utf-8")

    def issue(code: str, message: str, location: Span | None = None) -> PipelineIssue:
        return PipelineIssue(
            code=code, message=message, file_id=file.id, relative_path=file.relative_path, span=location
        )

    grammar = (
        tree_sitter_python.language() if file.language == Language.PYTHON else tree_sitter_java.language()
    )
    tree = Parser(Grammar(grammar)).parse(encoded)
    issues: list[PipelineIssue] = []
    if tree.root_node.has_error:
        issues.append(
            issue("syntax_error", "Tree-sitter found malformed or incomplete syntax", span(tree.root_node))
        )
    if not source:
        issues.append(issue("empty_file", "Empty source file"))
    if "\r" in source and config.normalize_newlines:
        issues.append(
            issue(
                "newline_normalized",
                "Normalized view converts CRLF/CR to LF; parsed view and original bytes are unchanged",
            )
        )
    if file.language == Language.JAVA and re.search(r"\\u+[0-9a-fA-F]{4}", source):
        issues.append(
            issue(
                "java_unicode_escape",
                "Java Unicode escapes are preserved; lexical records do not emulate compiler pretranslation",
            )
        )

    doc_spans: dict[tuple[int, int, int, int], str] = {}
    if file.language == Language.PYTHON:
        try:
            module = ast.parse(source)
            for owner in ast.walk(module):
                if not isinstance(owner, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    continue
                if not owner.body or not isinstance(owner.body[0], ast.Expr):
                    continue
                value = owner.body[0].value
                if (
                    isinstance(value, ast.Constant)
                    and isinstance(value.value, str)
                    and value.end_lineno is not None
                ):
                    doc_spans[(value.lineno, value.col_offset, value.end_lineno, value.end_col_offset)] = (
                        value.value
                    )
        except (SyntaxError, ValueError, RecursionError):
            issues.append(
                issue(
                    "python_ast_unavailable",
                    "Python AST docstring extraction unavailable for this source; lexical tokens retained",
                )
            )

    tokens: list[TokenRecord] = []
    comments: list[ExtractedComment] = []
    segments: list[NlpSegment] = []
    stack = [tree.root_node]
    exhausted = False
    while stack:
        node = stack.pop()
        atomic = node.type in STRING_TYPES | COMMENT_TYPES | NUMBER_TYPES or not node.children
        if not atomic:
            stack.extend(reversed(node.children))
            continue
        if node.start_byte == node.end_byte:
            continue
        if len(tokens) >= max_tokens:
            exhausted = True
            break
        raw = text(node)
        loc = span(node)
        if node.type in COMMENT_TYPES:
            kind = "comment"
        elif node.type in STRING_TYPES:
            kind = "string"
        elif node.type in NUMBER_TYPES:
            kind = "number"
        elif node.type in IDENTIFIERS:
            kind = "identifier"
        elif raw in (set(keyword.kwlist) if file.language == Language.PYTHON else JAVA_KEYWORDS):
            kind = "keyword"
        elif raw in {"(", ")", "[", "]", "{", "}", ",", ";", ".", ":"}:
            kind = "punctuation"
        elif not node.is_named:
            kind = "operator"
        else:
            kind = "other"
        token_id = stable_id(file.id, "token", str(node.start_byte), str(node.end_byte))
        tokens.append(
            TokenRecord(
                id=token_id,
                file_id=file.id,
                relative_path=file.relative_path,
                text=raw,
                kind=kind,
                span=loc,
                utf8_start=node.start_byte,
                utf8_end=node.end_byte,
            )
        )
        comment_kind = None
        if kind == "comment":
            comment_kind = (
                "javadoc" if file.language == Language.JAVA and raw.startswith("/**") else "comment"
            )
        key = (
            node.start_point.row + 1,
            node.start_point.column,
            node.end_point.row + 1,
            node.end_point.column,
        )
        if kind == "string" and key in doc_spans:
            comment_kind = "docstring"
        if comment_kind:
            comments.append(
                ExtractedComment(
                    id=stable_id(file.id, comment_kind, str(node.start_byte)),
                    file_id=file.id,
                    relative_path=file.relative_path,
                    kind=comment_kind,
                    text=raw,
                    span=loc,
                )
            )
            segment_text = doc_spans[key] if comment_kind == "docstring" else raw
            clean = _nlp(segment_text, comment_kind, config)
            if clean:
                segments.append(
                    NlpSegment(
                        file_id=file.id,
                        relative_path=file.relative_path,
                        kind=comment_kind,
                        text=clean,
                        span=loc,
                    )
                )
        elif kind == "identifier":
            segments.append(
                NlpSegment(
                    file_id=file.id,
                    relative_path=file.relative_path,
                    kind="identifier",
                    text=_nlp(raw, "identifier", config),
                    span=loc,
                )
            )
    if exhausted:
        issues.append(
            PipelineIssue(
                code="token_limit",
                message="Token limit exceeded; partial records are explicitly marked as an error",
                severity="error",
                file_id=file.id,
                relative_path=file.relative_path,
            )
        )
    normalized = source.replace("\r\n", "\n").replace("\r", "\n") if config.normalize_newlines else source
    return PreprocessingResult(
        id=stable_id(file.id, config.model_dump_json()),
        file_id=file.id,
        snapshot_id=file.snapshot_id,
        relative_path=file.relative_path,
        language=file.language,
        content_hash=file.content_hash,
        analysis_status="error" if exhausted else "warning" if issues else "complete",
        encoding=encoding,
        original_artifact=f"sha256:{file.content_hash}",
        parsed_source=source,
        normalized_source=normalized,
        nlp_segments=segments,
        tokens=tokens,
        comments=comments,
        issues=issues,
        statistics=FileStatistics(
            source_lines=len(source.splitlines()),
            comments=sum(c.kind != "docstring" for c in comments),
            docstrings=sum(c.kind == "docstring" for c in comments),
            tokens=len(tokens),
            unique_identifiers=len({t.text for t in tokens if t.kind == "identifier"}),
        ),
        parser_version=f"tree-sitter/{version('tree-sitter')};{file.language}/{version('tree-sitter-' + file.language)}"
        + (f";python-ast/{sys.version.split()[0]}" if file.language == Language.PYTHON else ""),
        tokenizer_version="codeatlas-lexical/1.0",
        configuration=config,
    )
