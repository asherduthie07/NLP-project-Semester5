"""Source-grounded deterministic documentation built from existing Phase IV hierarchy."""

import io
import zipfile

from fastapi import APIRouter
from fastapi.responses import Response

from nlp.hierarchy import compose


def router(service):
    api = APIRouter(prefix="/api/v1/jobs", tags=["Documentation"])

    def build(job_id):
        analysis = service.analysis(job_id)
        output = compose(analysis, service.result(analysis.preprocessing_job_id))
        documents, claims = [], []
        for symbol in analysis.symbols:
            summary = output["symbols"].get(symbol.id)
            if summary is None:
                continue
            documents.append(
                dict(
                    id=symbol.id,
                    path=symbol.evidence.relative_path,
                    symbol=symbol.qualified_name,
                    kind=symbol.kind,
                    existing=symbol.documented,
                    generated=True,
                    summary=summary.text,
                )
            )
            claims.append(
                dict(
                    id=symbol.id,
                    status="uncertain",
                    text=summary.text,
                    symbol=symbol.qualified_name,
                    path=symbol.evidence.relative_path,
                    line=symbol.evidence.span.start.line,
                )
            )
        provenance = dict(
            kind="measured", source="Phase IV deterministic hierarchy; semantic review required"
        )
        coverage = round(analysis.statistics.documentation_coverage * 100, 1)
        return dict(
            documents=documents,
            coverageBefore=coverage,
            coverageAfter=coverage,
            provenance=provenance,
            snapshotId=analysis.snapshot_id,
            summaries={k: v.model_dump(mode="json") for k, v in output["symbols"].items()},
            repository=output["repository"].model_dump(mode="json"),
        ), dict(
            claims=claims,
            summary=dict(total=len(claims), verified=0, uncertain=len(claims), unsupported=0),
            provenance=provenance,
        )

    @api.get("/{job_id}/documentation")
    def documentation(job_id: str):
        return build(job_id)[0]

    @api.get("/{job_id}/claims")
    def claims(job_id: str):
        return build(job_id)[1]

    @api.get("/{job_id}/documentation/export")
    def export(job_id: str):
        import json

        docs, claims = build(job_id)
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "README.md",
                "# Repository documentation\n\n"
                + "Generated from static source records. All behavioral claims require review. "
                + "Source files are unchanged; generated documentation is not inserted coverage.\n\n"
                + docs["repository"]["text"],
            )
            for index, doc in enumerate(docs["documents"]):
                summary = docs["summaries"][doc["id"]]
                evidence = summary["evidence"][0]
                archive.writestr(
                    f"reference/{index:04d}.md",
                    f"# {doc['symbol']}\n\n{doc['summary']}\n\n"
                    f"Source: {doc['path']}:{evidence['start_line']}\n\nReview required.\n\n"
                    + "```json\n"
                    + json.dumps(summary, indent=2)
                    + "\n```\n",
                )
            archive.writestr("documentation.json", json.dumps(docs, indent=2))
            archive.writestr("verification.json", json.dumps(claims, indent=2))
        return Response(
            stream.getvalue(),
            media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="codeatlas-docs.zip"'},
        )

    return api
