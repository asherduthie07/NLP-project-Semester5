"""Deterministic Phase II statistics and conservative repository edge resolution."""

import re
from collections import Counter, defaultdict

from analyzers.structure import analyze_file
from backend.codeatlas.contracts import (
    CAIR,
    ExploratoryStatistics,
    Frequency,
    PipelineIssue,
    StructuralAnalysis,
)


def _frequencies(values: list[str]) -> list[Frequency]:
    return [
        Frequency(value=k, count=v) for k, v in sorted(Counter(values).items(), key=lambda x: (-x[1], x[0]))
    ]


def _cycles(adjacency: dict[str, set[str]]) -> list[list[str]]:
    # Tarjan SCCs; each member is a real module in the snapshot.
    order = 0
    low: dict[str, int] = {}
    index: dict[str, int] = {}
    stack: list[str] = []
    active: set[str] = set()
    found: list[list[str]] = []

    def visit(node: str):
        nonlocal order
        index[node] = low[node] = order
        order += 1
        stack.append(node)
        active.add(node)
        for neighbor in sorted(adjacency.get(node, ())):
            if neighbor not in index:
                visit(neighbor)
                low[node] = min(low[node], low[neighbor])
            elif neighbor in active:
                low[node] = min(low[node], index[neighbor])
        if low[node] == index[node]:
            component = []
            while True:
                member = stack.pop()
                active.remove(member)
                component.append(member)
                if member == node:
                    break
            if len(component) > 1 or node in adjacency.get(node, ()):
                found.append(sorted(component))

    for node in sorted(adjacency):
        if node not in index:
            visit(node)
    return sorted(found)


def explore(cair: CAIR, preprocessing_job_id: str, duplicates: int = 0) -> StructuralAnalysis:
    symbols = []
    edges = []
    endpoints = []
    issues: list[PipelineIssue] = []
    for file in cair.results:
        s, e, a, w = analyze_file(file)
        symbols.extend(s)
        edges.extend(e)
        endpoints.extend(a)
        issues.extend(w)
    module_symbols = {s.qualified_name: s for s in symbols if s.kind == "module"}
    by_qualified = defaultdict(list)
    for symbol in symbols:
        by_qualified[symbol.qualified_name].append(symbol)
    resolved = []
    graph: dict[str, set[str]] = {name: set() for name in module_symbols}
    fanin = Counter()
    fanout = Counter()
    for edge in edges:
        target = None
        status = edge.resolution
        if edge.kind == "imports":
            source = next((s for s in symbols if s.id == edge.source_id), None)
            source_name = source.qualified_name if source else ""
            target_name = edge.target_name
            if target_name.startswith("."):
                level = len(target_name) - len(target_name.lstrip("."))
                prefix = source_name.split(".")[:-level]
                target_name = ".".join(prefix + ([target_name[level:]] if target_name[level:] else []))
            candidates = [s for name, s in module_symbols.items() if name == target_name]
            if len(candidates) == 1:
                target, status = candidates[0], "confirmed"
                graph[source_name].add(target.qualified_name)
                fanout[source_name] += 1
                fanin[target.qualified_name] += 1
            elif len(candidates) > 1:
                status = "ambiguous"
            else:
                status = "external" if not edge.target_name.startswith(".") else "unresolved"
        elif edge.kind in {"inherits", "implements"}:
            candidates = [
                s
                for s in symbols
                if s.kind in {"class", "interface", "record", "enum"}
                and (s.qualified_name == edge.target_name or s.name == edge.target_name)
            ]
            if len(candidates) == 1:
                target, status = candidates[0], "confirmed"
            elif len(candidates) > 1:
                status = "ambiguous"
        elif edge.kind == "calls" and status != "confirmed":
            # A bare call is resolved only when exactly one local callable has that name.
            candidates = [
                s
                for s in symbols
                if s.name == edge.target_name
                and s.kind in {"function", "method", "constructor"}
                and s.file_id == edge.evidence.file_id
            ]
            if len(candidates) == 1 and "." not in edge.target_name:
                target, status = candidates[0], "confirmed"
            elif len(candidates) > 1:
                status = "ambiguous"
        if target:
            edge = edge.model_copy(update={"target_id": target.id, "resolution": status})
        elif status != edge.resolution:
            edge = edge.model_copy(update={"resolution": status})
        resolved.append(edge)

    tokens = [t for file in cair.results for t in file.tokens]
    words = [t.text for t in tokens if t.kind != "comment"]
    identifiers = [t.text for t in tokens if t.kind == "identifier"]
    keywords = [t.text for t in tokens if t.kind == "keyword"]
    docs = [c for file in cair.results for c in file.comments]
    doc_terms = [term.lower() for d in docs for term in re.findall(r"[A-Za-z][A-Za-z0-9]*", d.text)]
    documentable = [
        s
        for s in symbols
        if s.kind in {"class", "interface", "enum", "record", "function", "method", "constructor"}
    ]
    by_kind = defaultdict(lambda: {"total": 0, "documented": 0})
    for s in documentable:
        by_kind[s.kind]["total"] += 1
        by_kind[s.kind]["documented"] += int(s.documented)
    funcs_per_module = Counter()
    methods_per_class = Counter()
    by_id = {s.id: s for s in symbols}
    for s in documentable:
        if s.kind == "function":
            funcs_per_module[s.evidence.relative_path] += 1
        if s.kind in {"method", "constructor"} and s.parent_id in by_id:
            methods_per_class[by_id[s.parent_id].qualified_name] += 1
    pattern = Counter()
    for name in identifiers:
        pattern[
            "snake_case"
            if "_" in name
            else "camelCase"
            if re.search(r"[a-z][A-Z]", name)
            else "UPPERCASE"
            if name.isupper()
            else "other"
        ] += 1
    counts = Counter(t.kind for t in tokens)
    stats = ExploratoryStatistics(
        files=len(cair.results),
        languages=dict(sorted(Counter(str(f.language) for f in cair.results).items())),
        source_lines=sum(f.statistics.source_lines for f in cair.results),
        comment_lines=sum(c.span.end.line - c.span.start.line + 1 for c in docs if c.kind != "docstring"),
        documented_symbols=sum(s.documented for s in documentable),
        documentable_symbols=len(documentable),
        documentation_coverage=sum(s.documented for s in documentable) / len(documentable)
        if documentable
        else 0,
        tokens=len(tokens),
        vocabulary_size=len(set(words)),
        lexical_diversity=len(set(words)) / len(words) if words else 0,
        duplicate_files=duplicates,
        token_types=dict(sorted(counts.items())),
        token_frequencies=_frequencies(words),
        identifiers=_frequencies(identifiers),
        keywords=_frequencies(keywords),
        documentation_terms=_frequencies(doc_terms),
        identifier_lengths=dict(sorted(Counter(map(len, identifiers)).items())),
        naming_patterns=dict(sorted(pattern.items())),
        comment_lengths=[len(c.text) for c in docs if c.kind == "comment"],
        docstring_lengths=[len(c.text) for c in docs if c.kind in {"docstring", "javadoc"}],
        symbols_by_kind=dict(sorted(Counter(s.kind for s in symbols).items())),
        documentation_by_kind=dict(sorted(by_kind.items())),
        undocumented_symbols=sorted(s.qualified_name for s in documentable if not s.documented),
        functions_per_module=dict(sorted(funcs_per_module.items())),
        methods_per_class=dict(sorted(methods_per_class.items())),
        function_lengths=[
            s.evidence.span.end.line - s.evidence.span.start.line + 1
            for s in documentable
            if s.kind in {"function", "method", "constructor"}
        ],
        class_sizes=[
            s.evidence.span.end.line - s.evidence.span.start.line + 1
            for s in documentable
            if s.kind in {"class", "interface", "enum", "record"}
        ],
        relationships_by_status=dict(sorted(Counter(e.resolution for e in resolved).items())),
        module_fan_in=dict(sorted(fanin.items())),
        module_fan_out=dict(sorted(fanout.items())),
        circular_dependencies=_cycles(graph),
    )
    return StructuralAnalysis(
        snapshot_id=cair.snapshot_id,
        preprocessing_job_id=preprocessing_job_id,
        symbols=symbols,
        relationships=resolved,
        endpoints=endpoints,
        statistics=stats,
        issues=issues,
    )
