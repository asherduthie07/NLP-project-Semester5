"""Conservative source structure extraction. Never imports or evaluates submitted code."""

import ast
import re
from collections import defaultdict

import tree_sitter_java
from tree_sitter import Language as Grammar
from tree_sitter import Parser

from analyzers.preprocessing import stable_id
from backend.codeatlas.contracts import (
    EndpointDeclaration,
    PipelineIssue,
    Position,
    PreprocessingResult,
    Relationship,
    SourceEvidence,
    Span,
    Symbol,
)


def _source(file: PreprocessingResult, start: int, col: int, end: int, endcol: int) -> SourceEvidence:
    return SourceEvidence(
        snapshot_id=file.snapshot_id,
        file_id=file.file_id,
        relative_path=file.relative_path,
        span=Span(start=Position(line=start, column=col), end=Position(line=end, column=endcol)),
    )


def _python(file: PreprocessingResult):
    symbols: list[Symbol] = []
    edges: list[Relationship] = []
    endpoints: list[EndpointDeclaration] = []
    issues: list[PipelineIssue] = []
    module_name = file.relative_path.removesuffix(".py").replace("/", ".")
    if module_name.endswith(".__init__"):
        module_name = module_name.removesuffix(".__init__")
    module_id = stable_id(file.snapshot_id, file.relative_path, "module")
    module_ev = _source(file, 1, 0, max(1, len(file.parsed_source.splitlines())), 0)
    symbols.append(
        Symbol(
            id=module_id,
            snapshot_id=file.snapshot_id,
            file_id=file.file_id,
            name=module_name,
            qualified_name=module_name,
            kind="module",
            evidence=module_ev,
            documented=any(c.kind == "docstring" and c.span.start.line == 1 for c in file.comments),
        )
    )

    def add_edge(
        source: str,
        target: str,
        kind: str,
        evidence: SourceEvidence,
        target_id=None,
        resolution="unresolved",
        alias=None,
    ):
        edges.append(
            Relationship(
                id=stable_id(
                    file.snapshot_id,
                    source,
                    kind,
                    target,
                    str(evidence.span.start.line),
                    str(evidence.span.start.column),
                ),
                snapshot_id=file.snapshot_id,
                source_id=source,
                target_id=target_id,
                target_name=target,
                alias=alias,
                kind=kind,
                resolution=resolution,
                evidence=evidence,
            )
        )

    try:
        root = ast.parse(file.parsed_source)
    except (SyntaxError, ValueError, RecursionError):
        issues.append(
            PipelineIssue(
                code="structure_unavailable",
                message="Python AST unavailable; lexical records remain",
                file_id=file.file_id,
                relative_path=file.relative_path,
                span=module_ev.span,
            )
        )
        return symbols, edges, endpoints, issues

    def ev(node):
        lines = file.parsed_source.split("\n")

        def column(line, offset):
            return len(lines[line - 1].encode("utf-8")[:offset].decode("utf-8"))

        end_line = getattr(node, "end_lineno", node.lineno)
        return _source(
            file,
            node.lineno,
            column(node.lineno, node.col_offset),
            end_line,
            column(end_line, getattr(node, "end_col_offset", node.col_offset)),
        )

    def render(node):
        return ast.unparse(node) if node is not None else None

    fastapi_names = {
        alias.asname or alias.name
        for statement in root.body
        if isinstance(statement, ast.ImportFrom) and statement.module == "fastapi"
        for alias in statement.names
        if alias.name in {"FastAPI", "APIRouter"}
    }
    router_names = {
        target.id
        for statement in root.body
        if isinstance(statement, (ast.Assign, ast.AnnAssign))
        for target in (statement.targets if isinstance(statement, ast.Assign) else [statement.target])
        if isinstance(target, ast.Name)
        and isinstance(statement.value, ast.Call)
        and isinstance(statement.value.func, ast.Name)
        and statement.value.func.id in fastapi_names
    }

    def walk(body, parent_id, scope, parent_kind, local_depth=0):
        for node in body:
            if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                name = node.name
                kind = (
                    "class"
                    if isinstance(node, ast.ClassDef)
                    else ("method" if parent_kind == "class" else "function")
                )
                if kind == "method" and name == "__init__":
                    kind = "constructor"
                qn = f"{scope}.{name}"
                symbol_id = stable_id(
                    file.snapshot_id, file.relative_path, kind, qn, str(node.lineno), str(node.col_offset)
                )
                decorators = [render(d) for d in node.decorator_list]
                params = (
                    [a.arg for a in node.args.posonlyargs + node.args.args + node.args.kwonlyargs]
                    if kind != "class"
                    else []
                )
                if kind != "class":
                    params += ([node.args.vararg.arg] if node.args.vararg else []) + (
                        [node.args.kwarg.arg] if node.args.kwarg else []
                    )
                modifiers = ["async"] if isinstance(node, ast.AsyncFunctionDef) else []
                modifiers += [d for d in ("staticmethod", "classmethod") if d in decorators]
                documented = ast.get_docstring(node, clean=False) is not None
                doc_evidence = None
                if documented and node.body:
                    doc_line = node.body[0].lineno
                    doc_evidence = next(
                        (
                            SourceEvidence(
                                snapshot_id=file.snapshot_id,
                                file_id=file.file_id,
                                relative_path=file.relative_path,
                                span=c.span,
                            )
                            for c in file.comments
                            if c.kind == "docstring" and c.span.start.line == doc_line
                        ),
                        None,
                    )
                sym = Symbol(
                    id=symbol_id,
                    snapshot_id=file.snapshot_id,
                    file_id=file.file_id,
                    name=name,
                    qualified_name=qn,
                    kind=kind,
                    parent_id=parent_id,
                    signature=render(node.args) if kind != "class" else None,
                    parameters=params,
                    return_type=render(node.returns) if kind != "class" else None,
                    modifiers=modifiers,
                    decorators=decorators,
                    documented=documented,
                    documentation_evidence=doc_evidence,
                    evidence=ev(node),
                )
                symbols.append(sym)
                add_edge(parent_id, qn, "contains", ev(node), symbol_id, "confirmed")
                if kind == "class":
                    for base in node.bases:
                        add_edge(symbol_id, render(base), "inherits", ev(base))
                else:
                    for decorator in node.decorator_list:
                        if (
                            isinstance(decorator, ast.Call)
                            and isinstance(decorator.func, ast.Attribute)
                            and isinstance(decorator.func.value, ast.Name)
                            and decorator.func.value.id in router_names
                        ):
                            method = decorator.func.attr.upper()
                            if (
                                method in {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}
                                and decorator.args
                            ):
                                route = decorator.args[0]
                                if isinstance(route, ast.Constant) and isinstance(route.value, str):
                                    endpoints.append(
                                        EndpointDeclaration(
                                            id=stable_id(symbol_id, "endpoint", method, route.value),
                                            snapshot_id=file.snapshot_id,
                                            symbol_id=symbol_id,
                                            method=method,
                                            route=route.value,
                                            framework="FastAPI-compatible decorator",
                                            evidence=ev(decorator),
                                        )
                                    )
                walk(node.body, symbol_id, qn, kind, local_depth + 1)
            elif isinstance(node, (ast.Import, ast.ImportFrom)):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        add_edge(module_id, alias.name, "imports", ev(node), alias=alias.asname)
                else:
                    prefix = "." * node.level + (node.module or "")
                    add_edge(
                        module_id,
                        prefix,
                        "imports",
                        ev(node),
                        alias=",".join(f"{a.name}:{a.asname}" if a.asname else a.name for a in node.names),
                    )
            else:
                assignments = []
                if isinstance(node, ast.Assign):
                    assignments = [
                        n
                        for target in node.targets
                        for n in ast.walk(target)
                        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store)
                    ]
                elif isinstance(node, ast.AnnAssign):
                    assignments = [
                        n
                        for n in ast.walk(node.target)
                        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store)
                    ]
                for target in assignments:
                    name = target.id
                    kind = "field" if parent_kind == "class" else "variable"
                    qn = f"{scope}.{name}"
                    sid = stable_id(
                        file.snapshot_id,
                        file.relative_path,
                        kind,
                        qn,
                        str(target.lineno),
                        str(target.col_offset),
                    )
                    symbols.append(
                        Symbol(
                            id=sid,
                            snapshot_id=file.snapshot_id,
                            file_id=file.file_id,
                            name=name,
                            qualified_name=qn,
                            kind=kind,
                            parent_id=parent_id,
                            evidence=ev(target),
                        )
                    )
                    add_edge(parent_id, qn, "contains", ev(target), sid, "confirmed")
                # Traverse control-flow bodies without losing enclosing lexical scope.
                for field in ("body", "orelse", "finalbody"):
                    child = getattr(node, field, None)
                    if isinstance(child, list):
                        walk(child, parent_id, scope, parent_kind, local_depth)
                if isinstance(node, ast.Try):
                    for handler in node.handlers:
                        walk(handler.body, parent_id, scope, parent_kind, local_depth)

    walk(root.body, module_id, module_name, "module")
    # Calls are linked only for same-module names with a unique lexical candidate.
    by_name = defaultdict(list)
    for symbol in symbols:
        if symbol.kind in {"function", "method", "constructor"}:
            by_name[symbol.name].append(symbol)
    for node in ast.walk(root):
        if not isinstance(node, ast.Call):
            continue
        owner = next(
            (
                s
                for s in sorted(symbols, key=lambda s: s.evidence.span.start.line, reverse=True)
                if s.kind in {"function", "method", "constructor"}
                and s.evidence.span.start.line <= node.lineno <= s.evidence.span.end.line
            ),
            None,
        )
        if owner is None:
            continue
        if isinstance(node.func, ast.Name):
            candidates = by_name.get(node.func.id, [])
            target = candidates[0] if len(candidates) == 1 else None
            add_edge(
                owner.id,
                node.func.id,
                "calls",
                ev(node.func),
                target.id if target else None,
                "confirmed" if target else "ambiguous" if candidates else "unresolved",
            )
        elif isinstance(node.func, ast.Attribute):
            add_edge(owner.id, render(node.func), "calls", ev(node.func))
    return symbols, edges, endpoints, issues


def _java(file: PreprocessingResult):
    source = file.parsed_source
    encoded = source.encode("utf-8")
    tree = Parser(Grammar(tree_sitter_java.language())).parse(encoded)
    lines = source.split("\n")
    symbols: list[Symbol] = []
    edges: list[Relationship] = []
    issues: list[PipelineIssue] = []
    endpoints: list[EndpointDeclaration] = []
    package = ""
    module_name = file.relative_path.removesuffix(".java").replace("/", ".")
    module_id = stable_id(file.snapshot_id, file.relative_path, "module")

    def raw(node):
        return encoded[node.start_byte : node.end_byte].decode("utf-8")

    def ev(node):
        def pos(point):
            start = sum(len(line.encode("utf-8")) + 1 for line in lines[: point.row])
            return Position(
                line=point.row + 1, column=len(encoded[start : start + point.column].decode("utf-8"))
            )

        return SourceEvidence(
            snapshot_id=file.snapshot_id,
            file_id=file.file_id,
            relative_path=file.relative_path,
            span=Span(start=pos(node.start_point), end=pos(node.end_point)),
        )

    def edge(source_id, target, kind, evidence, target_id=None, resolution="unresolved"):
        edges.append(
            Relationship(
                id=stable_id(
                    file.snapshot_id,
                    source_id,
                    kind,
                    target,
                    str(evidence.span.start.line),
                    str(evidence.span.start.column),
                ),
                snapshot_id=file.snapshot_id,
                source_id=source_id,
                target_id=target_id,
                target_name=target,
                kind=kind,
                resolution=resolution,
                evidence=evidence,
            )
        )

    def traverse(node, parent_id=None, scope=None, parent_kind=None):
        nonlocal package
        typ = node.type
        if typ == "package_declaration":
            package = raw(node).removeprefix("package").strip().rstrip(";")
        elif typ == "import_declaration":
            name = raw(node).removeprefix("import").strip().removeprefix("static ").rstrip(";")
            edge(module_id, name, "imports", ev(node))
        class_kinds = {
            "class_declaration": "class",
            "interface_declaration": "interface",
            "enum_declaration": "enum",
            "record_declaration": "record",
        }
        if typ in class_kinds | {"method_declaration": "method", "constructor_declaration": "constructor"}:
            kind = class_kinds.get(typ, "method" if typ == "method_declaration" else "constructor")
            name_node = node.child_by_field_name("name")
            if name_node is not None:
                name = raw(name_node)
                qn = f"{scope or package or module_name}.{name}"
                params_node = node.child_by_field_name("parameters")
                params = []
                if params_node is not None:
                    params = [
                        raw(c.child_by_field_name("name"))
                        for c in params_node.named_children
                        if c.child_by_field_name("name") is not None
                    ]
                signature = raw(params_node) if params_node is not None else None
                if kind in {"method", "constructor"}:
                    qn += signature or "()"  # Overloads differ by parameter types.
                sid = stable_id(file.snapshot_id, file.relative_path, kind, qn, str(node.start_byte))
                prefix = raw(node)[: max(0, name_node.start_byte - node.start_byte)]
                modifiers = re.findall(
                    r"\b(?:public|private|protected|static|final|abstract|synchronized|native|default)\b",
                    prefix,
                )
                documented = any(
                    c.kind == "javadoc"
                    and c.span.end.line in {node.start_point.row, node.start_point.row + 1}
                    for c in file.comments
                )
                doc_evidence = next(
                    (
                        SourceEvidence(
                            snapshot_id=file.snapshot_id,
                            file_id=file.file_id,
                            relative_path=file.relative_path,
                            span=c.span,
                        )
                        for c in file.comments
                        if c.kind == "javadoc"
                        and c.span.end.line in {node.start_point.row, node.start_point.row + 1}
                    ),
                    None,
                )
                annotations = re.findall(r"@[A-Za-z_][A-Za-z_0-9]*(?:\([^\n)]*\))?", prefix)
                symbol = Symbol(
                    id=sid,
                    snapshot_id=file.snapshot_id,
                    file_id=file.file_id,
                    name=name,
                    qualified_name=qn,
                    kind=kind,
                    parent_id=parent_id or module_id,
                    signature=signature,
                    parameters=params,
                    return_type=raw(node.child_by_field_name("type"))
                    if node.child_by_field_name("type")
                    else None,
                    modifiers=modifiers,
                    decorators=annotations,
                    documented=documented,
                    documentation_evidence=doc_evidence,
                    evidence=ev(node),
                )
                symbols.append(symbol)
                edge(parent_id or module_id, qn, "contains", ev(node), sid, "confirmed")
                if kind == "method" and "org.springframework.web.bind.annotation" in source:
                    for annotation in annotations:
                        match = re.match(
                            r'@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping)\("([^"]+)"\)',
                            annotation,
                        )
                        if match:
                            method = match.group(1).removesuffix("Mapping").upper()
                            route = match.group(2)
                            endpoints.append(
                                EndpointDeclaration(
                                    id=stable_id(sid, "endpoint", method, route),
                                    snapshot_id=file.snapshot_id,
                                    symbol_id=sid,
                                    method=method,
                                    route=route,
                                    framework="Spring mapping annotation",
                                    evidence=ev(node),
                                )
                            )
                if kind in class_kinds.values():
                    for child in node.named_children:
                        if child.type in {"superclass", "super_interfaces", "extends_interfaces"}:
                            relation = "implements" if child.type == "super_interfaces" else "inherits"
                            for identifier in child.named_children:
                                edge(sid, raw(identifier), relation, ev(identifier))
                for child in node.children:
                    traverse(child, sid, qn, kind)
                return
        if typ in {"field_declaration", "local_variable_declaration"} and parent_id:
            for child in node.named_children:
                if child.type == "variable_declarator":
                    name = child.child_by_field_name("name")
                    if name:
                        label = raw(name)
                        kind = "field" if typ == "field_declaration" else "variable"
                        qn = f"{scope}.{label}"
                        sid = stable_id(file.snapshot_id, file.relative_path, kind, qn, str(name.start_byte))
                        symbols.append(
                            Symbol(
                                id=sid,
                                snapshot_id=file.snapshot_id,
                                file_id=file.file_id,
                                name=label,
                                qualified_name=qn,
                                kind=kind,
                                parent_id=parent_id,
                                signature=raw(node.child_by_field_name("type"))
                                if node.child_by_field_name("type")
                                else None,
                                evidence=ev(name),
                            )
                        )
                        edge(parent_id, qn, "contains", ev(name), sid, "confirmed")
        if typ == "method_invocation" and parent_id and parent_kind in {"method", "constructor"}:
            name = node.child_by_field_name("name")
            if name:
                edge(parent_id, raw(name), "calls", ev(node))
        for child in node.children:
            traverse(child, parent_id, scope, parent_kind)

    traverse(tree.root_node)
    module_qualified = f"{package}.{module_name.split('.')[-1]}" if package else module_name
    symbols.insert(
        0,
        Symbol(
            id=module_id,
            snapshot_id=file.snapshot_id,
            file_id=file.file_id,
            name=module_name.split(".")[-1],
            qualified_name=module_qualified,
            kind="module",
            evidence=_source(file, 1, 0, max(1, len(lines)), 0),
        ),
    )
    if tree.root_node.has_error:
        issues.append(
            PipelineIssue(
                code="partial_java_structure",
                message="Tree-sitter recovered partial Java structure",
                file_id=file.file_id,
                relative_path=file.relative_path,
            )
        )
    return symbols, edges, endpoints, issues


def analyze_file(file: PreprocessingResult):
    return _python(file) if file.language == "python" else _java(file)
