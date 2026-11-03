"""Parser-derived declaration baseline, independent from the trained NER model."""

import ast
import io
import tokenize

from nlp.contracts import NEREntity
from nlp.summarization import validate_source


def declarations(item):
    validate_source(item)
    source = item.source
    entities = []
    if item.language == "python":
        tree = ast.parse(source)
        lines = source.splitlines(keepends=True)
        starts, offset = [], 0
        for line in lines:
            starts.append(offset)
            offset += len(line)
        tokens = list(tokenize.generate_tokens(io.StringIO(source).readline))
        for index, token in enumerate(tokens[:-1]):
            if token.type == tokenize.NAME and token.string == "def":
                name = tokens[index + 1]
                start = starts[name.start[0] - 1] + name.start[1]
                entities.append(
                    NEREntity(label="FUNCTION", text=name.string, start=start, end=start + len(name.string))
                )
        for node in ast.walk(tree):
            if isinstance(node, ast.arg):
                line = lines[node.lineno - 1]
                column = len(line.encode("utf-8")[: node.col_offset].decode("utf-8"))
                start = starts[node.lineno - 1] + column
                entities.append(
                    NEREntity(label="PARAMETER", text=node.arg, start=start, end=start + len(node.arg))
                )
    else:
        import tree_sitter_java
        from tree_sitter import Language, Parser

        prefix = b"class Fixture {"
        wrapped = prefix + source.encode("utf-8") + b"}"
        tree = Parser(Language(tree_sitter_java.language())).parse(wrapped)
        if tree.root_node.has_error:
            raise ValueError("Malformed Java declaration fragment")
        stack = [tree.root_node]
        while stack:
            node = stack.pop()
            category = {
                "method_declaration": "METHOD",
                "formal_parameter": "PARAMETER",
                "spread_parameter": "PARAMETER",
            }.get(node.type)
            if category:
                name = node.child_by_field_name("name")
                if name:
                    start = len(wrapped[len(prefix) : name.start_byte].decode("utf-8"))
                    text = name.text.decode("utf-8")
                    entities.append(NEREntity(label=category, text=text, start=start, end=start + len(text)))
            stack.extend(node.children)
    return sorted(entities, key=lambda entity: (entity.start, entity.end, entity.label))
