"""Content-addressed, write-once artifacts. Imported paths never become disk paths."""

import os
import re
import tempfile
from pathlib import Path

from .errors import PipelineError
from .ingestion import digest


class ArtifactStore:
    def __init__(self, root: Path):
        if root.is_symlink():
            raise PipelineError("unsafe_storage", "Storage root must not be a symlink", 500)
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.root = root.resolve()

    def _path(self, content_hash: str) -> Path:
        if not re.fullmatch(r"[a-f0-9]{64}", content_hash):
            raise PipelineError("invalid_artifact", "Invalid artifact identifier", 400)
        return self.root / content_hash

    def put(self, data: bytes) -> str:
        key = digest(data)
        path = self._path(key)
        fd, temporary_name = tempfile.mkstemp(prefix=".pending-", dir=self.root)
        temporary = Path(temporary_name)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
                os.fchmod(handle.fileno(), 0o400)
            # An atomic hard-link publishes only a fully written artifact.
            try:
                os.link(temporary, path, follow_symlinks=False)
            except FileExistsError:
                if self.get(key) != data:
                    raise PipelineError(
                        "artifact_collision", "Artifact integrity check failed", 500
                    ) from None
        finally:
            temporary.unlink(missing_ok=True)
        return key

    def get(self, key: str) -> bytes:
        try:
            fd = os.open(self._path(key), os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, "rb") as handle:
                data = handle.read()
        except OSError as exc:
            raise PipelineError("artifact_unavailable", "Source artifact unavailable", 500) from exc
        if digest(data) != key:
            raise PipelineError("artifact_integrity", "Source artifact failed hash verification", 500)
        return data
