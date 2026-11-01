"""Export checked-in API contract without requiring a running database."""

import json
import tempfile
from pathlib import Path

from backend.codeatlas.api import create_app
from backend.codeatlas.config import Settings

with tempfile.TemporaryDirectory(prefix="codeatlas-openapi-") as directory:
    app = create_app(Settings(storage_root=Path(directory), database_url="sqlite://"))
    Path("docs/03-architecture/openapi.json").write_text(json.dumps(app.openapi(), indent=2) + "\n")
    app.state.service.engine.dispose()
