"""Live HTTP/Celery smoke, separate from offline model tests. No generated metrics."""

import argparse
import json
import time

import httpx


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8001")
    args = parser.parse_args()
    with httpx.Client(base_url=args.url, timeout=15) as client:
        for attempt in range(30):
            try:
                client.get("/api/v1/health").raise_for_status()
                break
            except httpx.HTTPError:
                if attempt == 29:
                    raise
                time.sleep(1)
        imported = client.post(
            "/api/v1/imports/files",
            files=[
                ("files", ("maths.py", b"def add(a, b):\n    return a + b\n")),
                ("files", ("Maths.java", b"class Maths { int twice(int x) { return x * 2; } }")),
            ],
        )
        imported.raise_for_status()
        snapshot = imported.json()

        def wait(job):
            for _ in range(100):
                response = client.get(f"/api/v1/jobs/{job['id']}")
                response.raise_for_status()
                current = response.json()
                if current["status"] in {"complete", "failed"}:
                    return current
                time.sleep(0.2)
            raise RuntimeError("Job deadline exceeded")

        pre = client.post(f"/api/v1/snapshots/{snapshot['id']}/preprocessing", json={})
        pre.raise_for_status()
        assert wait(pre.json())["status"] == "complete"
        analysis_job = client.post(f"/api/v1/snapshots/{snapshot['id']}/analysis")
        analysis_job.raise_for_status()
        job = wait(analysis_job.json())
        assert job["status"] == "complete"
        analysis = client.get(f"/api/v1/jobs/{job['id']}/analysis").json()
        graph = client.get(f"/api/v1/jobs/{job['id']}/graph")
        graph.raise_for_status()
        results = []
        for symbol in analysis["symbols"]:
            if symbol["kind"] not in {"function", "method"}:
                continue
            body = {"analysis_job_id": job["id"], "symbol_id": symbol["id"], "method": "baseline"}
            endpoint = f"/api/v1/nlp/snapshots/{snapshot['id']}/jobs"
            response = client.post(endpoint, json=body)
            response.raise_for_status()
            nlp_job = wait(response.json())
            assert nlp_job["status"] == "complete"
            result = client.get(f"/api/v1/nlp/snapshots/{snapshot['id']}/jobs/{nlp_job['id']}/result")
            result.raise_for_status()
            assert result.json()["evidence"][0]["snapshot_id"] == snapshot["id"]
            assert client.post(endpoint, json=body).json()["id"] == nlp_job["id"]
            results.append(result.json())
        assert len(results) == 2
        print(
            json.dumps(
                {
                    "status": "complete",
                    "transport": "live HTTP (database and job execution mode configured by the server)",
                    "snapshot_id": snapshot["id"],
                    "source_files": len(snapshot["manifest"]["files"]),
                    "graph_nodes": len(graph.json()["nodes"]),
                    "baseline_results": results,
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
