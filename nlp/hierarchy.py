"""Deterministic CAIR composition; no whole-repository transformer claim."""

from collections import Counter

from nlp.contracts import Evidence, GeneratedSummary, GroundingResult, ModelInput
from nlp.dataset import digest
from nlp.summarization import baseline, hierarchy


def compose(analysis, preprocessing, supplied=None, repository_name="Repository"):
    if analysis.snapshot_id != preprocessing.snapshot_id:
        raise ValueError("Cross-snapshot analysis/preprocessing")
    supplied = supplied or {}
    symbols = {symbol.id: symbol for symbol in analysis.symbols}
    files = {file.file_id: file for file in preprocessing.results}
    if not set(supplied) <= symbols.keys():
        raise ValueError("Unknown supplied summary symbol")
    results, active = {}, set()

    def source_evidence(symbol):
        span = symbol.evidence.span
        lines = files[symbol.file_id].parsed_source.split("\n")[span.start.line - 1 : span.end.line]
        if len(lines) == 1:
            source = lines[0][span.start.column : span.end.column]
        else:
            lines[0] = lines[0][span.start.column :]
            lines[-1] = lines[-1][: span.end.column]
            source = "\n".join(lines)
        return source, Evidence(
            snapshot_id=analysis.snapshot_id,
            symbol_id=symbol.id,
            path=symbol.evidence.relative_path,
            source_hash=digest(source),
            start_line=span.start.line,
            start_column=span.start.column,
            end_line=span.end.line,
            end_column=span.end.column,
        )

    def build(symbol):
        if symbol.id in active:
            raise ValueError("Cyclic containment")
        if symbol.id in results:
            return results[symbol.id]
        active.add(symbol.id)
        source, evidence = source_evidence(symbol)
        if symbol.id in supplied:
            result = supplied[symbol.id]
            if result.status != "complete" or evidence not in result.evidence:
                raise ValueError("Supplied summary evidence mismatch")
        elif symbol.kind in {"function", "method", "constructor"}:
            result = baseline(
                ModelInput(
                    source=source,
                    language=files[symbol.file_id].language,
                    name=symbol.name,
                    parameters=symbol.parameters,
                    return_type=symbol.return_type,
                    evidence=evidence,
                )
            )
        else:
            children = [s for s in analysis.symbols if s.parent_id == symbol.id]
            counts = Counter(s.kind for s in children)
            links = [
                edge
                for edge in analysis.relationships
                if edge.source_id == symbol.id and edge.kind in {"imports", "inherits", "implements"}
            ]
            facts = f"CAIR records {symbol.kind} {symbol.qualified_name}. "
            facts += (
                "Direct members: "
                + (", ".join(f"{v} {k}" for k, v in sorted(counts.items())) or "none")
                + "."
            )
            if links:
                facts += (
                    " Recorded references: "
                    + "; ".join(f"{edge.kind} {edge.target_name} ({edge.resolution})" for edge in links)
                    + "."
                )
            fact_result = GeneratedSummary(
                status="complete",
                method="hierarchical",
                text=facts,
                evidence=[evidence],
                warnings=["CAIR extraction accuracy awaits independent Phase II review."],
                grounding=[
                    GroundingResult(
                        status="REVIEW_REQUIRED",
                        check="hierarchy_semantics",
                        detail="Structural records do not establish inferred module purpose or entry points.",
                        evidence=evidence,
                    )
                ],
            )
            child_results = [
                build(child)
                for child in children
                if child.kind in {"function", "method", "constructor", "class", "interface", "enum", "record"}
            ]
            level = "module" if symbol.kind == "module" else "class"
            result = hierarchy(level, symbol.qualified_name, [fact_result, *child_results])
            result.text = facts + (
                " " + " ".join(child.text for child in child_results) if child_results else ""
            )
        if symbol.kind in {"function", "method", "constructor"}:
            nested = [
                build(child)
                for child in analysis.symbols
                if child.parent_id == symbol.id and child.kind in {"function", "method", "class"}
            ]
            if nested:
                combined = hierarchy("module", symbol.qualified_name, [result, *nested])
                combined.text = (
                    result.text + " Nested declarations: " + " ".join(child.text for child in nested)
                )
                result = combined
        active.remove(symbol.id)
        results[symbol.id] = result
        return result

    modules = [build(symbol) for symbol in analysis.symbols if symbol.kind == "module"]
    if not modules:
        raise ValueError("No modules available for repository synthesis")
    repository = hierarchy("repository", repository_name, modules)
    repository.warnings.append("Entry points and arbitrary semantic purpose are not inferred.")
    return {"symbols": results, "repository": repository}
