"""Regenerate Phase II synthetic findings and simple measured SVG bar charts."""

import json
import tempfile
from pathlib import Path
from xml.sax.saxutils import escape

from backend.codeatlas.config import Settings
from backend.codeatlas.contracts import PreprocessingConfig
from backend.codeatlas.ingestion import collect_files
from backend.codeatlas.models import Base
from backend.codeatlas.service import Service


def chart(title: str, counts: list[tuple[str, int]]) -> str:
    top = counts[:12]
    width, height = 760, 80 + 28 * len(top)
    maximum = max((v for _, v in top), default=1)
    rows = []
    for index, (label, count) in enumerate(top):
        y = 60 + 28 * index
        bar = 410 * count / maximum
        rows.append(
            f'<text x="10" y="{y + 13}" fill="#EAF1FF">{escape(label)}</text>'
            f'<rect x="270" y="{y}" width="{bar:.1f}" height="18" fill="#22D3EE"/>'
            f'<text x="{280 + bar:.1f}" y="{y + 13}" fill="#EAF1FF">{count}</text>'
        )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img" aria-label="{title}">'
        f'<rect width="100%" height="100%" fill="#060912"/>'
        f'<text x="10" y="35" fill="#EAF1FF" font-size="18">{title}</text>' + "".join(rows) + "</svg>\n"
    )


def main():
    root = Path(__file__).resolve().parents[1]
    out = root / "docs/07-findings/phase-2"
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="codeatlas-phase2-") as temp:
        settings = Settings(
            database_url=f"sqlite:///{temp}/report.db", storage_root=Path(temp) / "blobs", job_mode="inline"
        )
        service = Service(settings)
        Base.metadata.create_all(service.engine)
        files = [(p.name, p.read_bytes()) for p in sorted((root / "datasets/samples").iterdir())]
        snapshot = service.import_collection(
            service.create_project("Synthetic Phase II corpus").id,
            collect_files(files, settings, archive=True),
            "files",
        )
        pre = service.create_job(
            "preprocess", {"configuration": PreprocessingConfig().model_dump()}, snapshot.id
        )
        service.run_job(pre.id)
        job = service.create_job("analyze", {"preprocessing_job_id": pre.id}, snapshot.id)
        service.run_job(job.id)
        analysis = service.analysis(job.id)
        stats = analysis.statistics.model_dump(mode="json")
        report = {
            "provenance": "MIT synthetic CodeAtlas fixtures; not live GitHub data",
            "analyzer_version": analysis.analyzer_version,
            "statistics": stats,
            "symbols": [
                {
                    "path": s.evidence.relative_path,
                    "name": s.qualified_name,
                    "kind": s.kind,
                    "line": s.evidence.span.start.line,
                }
                for s in analysis.symbols
            ],
            "relationships": [
                {"kind": e.kind, "source": e.source_id, "target": e.target_name, "resolution": e.resolution}
                for e in analysis.relationships
            ],
            "issues": [i.code for i in analysis.issues],
        }
        (out / "analysis.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
        charts = {
            "identifiers": [(f.value, f.count) for f in analysis.statistics.identifiers],
            "tokens": list(stats["token_types"].items()),
            "functions": list(stats["functions_per_module"].items()),
            "documentation": [
                (f"{k} ({v['documented']}/{v['total']})", v["documented"])
                for k, v in stats["documentation_by_kind"].items()
            ],
            "dependencies": list(stats["module_fan_out"].items()),
        }
        for title, values in charts.items():
            (out / f"{title}.svg").write_text(chart(title.title(), values))
        print(
            json.dumps(
                {
                    "files": stats["files"],
                    "symbols": len(analysis.symbols),
                    "relationships": len(analysis.relationships),
                    "endpoints": len(analysis.endpoints),
                    "coverage": stats["documentation_coverage"],
                    "issues": len(analysis.issues),
                },
                indent=2,
            )
        )
        service.engine.dispose()


if __name__ == "__main__":
    main()
