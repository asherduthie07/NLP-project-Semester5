"""Repository-separated, provenance-preserving small-corpus preparation."""

import ast
import hashlib
import re
from difflib import SequenceMatcher
from typing import Literal

from pydantic import Field

from nlp.contracts import ModelContract, NEREntity


def digest(source: str) -> str:
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


class Example(ModelContract):
    id: str
    repository: str
    revision: str
    path: str
    language: Literal["python", "java"]
    name: str
    qualified_name: str | None = None
    signature: str | None = None
    documentation: str | None = None
    source_hash: str | None = None
    source: str
    reference: str | None = None
    reference_quality: Literal["human_reviewed", "synthetic_unreviewed", "docstring_unreviewed"]
    license: str
    entities: list[NEREntity] = Field(default_factory=list)
    split: Literal["train", "validation", "test"]


def validate_entities(example: Example):
    end = 0
    for entity in sorted(example.entities, key=lambda e: e.start):
        if not (end <= entity.start < entity.end <= len(example.source)):
            raise ValueError("Overlapping or invalid entity boundary")
        if example.source[entity.start : entity.end] != entity.text:
            raise ValueError("Entity text does not match original source")
        end = entity.end


def prepare(examples: list[Example]):
    accepted, issues, hashes, repos = [], [], set(), {}
    for item in examples:
        if item.repository in repos and repos[item.repository] != item.split:
            raise ValueError("Repository leakage across splits")
        repos[item.repository] = item.split
        validate_entities(item)
        if not item.source.strip() or len(item.source) > 100000 or "\x00" in item.source:
            issues.append({"id": item.id, "reason": "invalid_or_excessive_source"})
            continue
        try:
            signature, documentation = item.signature, item.documentation
            if item.language == "python":
                tree = ast.parse(item.source)
                function = next(
                    (
                        n
                        for n in ast.walk(tree)
                        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == item.name
                    ),
                    None,
                )
                if function is None:
                    raise ValueError("Source/name alignment")
                signature = f"{function.name}({ast.unparse(function.args)})"
                if function.returns:
                    signature += " -> " + ast.unparse(function.returns)
                documentation = ast.get_docstring(function, clean=False)
            else:
                import tree_sitter_java
                from tree_sitter import Language, Parser

                tree = Parser(Language(tree_sitter_java.language())).parse(
                    ("class Fixture {" + item.source + "}").encode()
                )
                stack, names = [tree.root_node], []
                while stack:
                    node = stack.pop()
                    if node.type in {"method_declaration", "constructor_declaration"}:
                        name = node.child_by_field_name("name")
                        if name:
                            names.append(name.text.decode("utf-8"))
                            if name.text.decode("utf-8") == item.name:
                                body = node.child_by_field_name("body")
                                signature = (
                                    node.text[: body.start_byte - node.start_byte].decode("utf-8").strip()
                                    if body
                                    else node.text.decode("utf-8")
                                )
                    stack.extend(node.children)
                if tree.root_node.has_error or item.name not in names:
                    raise ValueError("Invalid Java method")
        except (SyntaxError, ValueError):
            issues.append({"id": item.id, "reason": "invalid_source_or_alignment"})
            continue
        if (
            not item.reference
            or not item.reference.strip()
            or item.reference.strip().lower() in {"todo", "placeholder", "fixme"}
        ):
            issues.append({"id": item.id, "reason": "missing_or_placeholder_reference"})
            continue
        if not item.license.strip() or not item.revision.strip():
            raise ValueError("Missing license or revision")
        code_hash = digest(item.source)
        if item.source_hash is not None and item.source_hash != code_hash:
            raise ValueError("Source hash mismatch")
        if code_hash in hashes:
            issues.append({"id": item.id, "reason": "duplicate"})
            continue
        normal = re.sub(r"\s+", " ", item.source).strip()
        if any(
            SequenceMatcher(None, normal, re.sub(r"\s+", " ", p.source).strip()).ratio() >= 0.95
            for p in accepted
        ):
            issues.append({"id": item.id, "reason": "near_duplicate"})
            continue
        hashes.add(code_hash)
        accepted.append(
            item.model_copy(
                update={
                    "source_hash": code_hash,
                    "signature": signature,
                    "documentation": documentation,
                    "qualified_name": item.qualified_name or item.name,
                }
            )
        )
    return accepted, issues
