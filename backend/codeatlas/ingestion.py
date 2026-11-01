"""Bounded acquisition. ZIP entries are read into memory; never extractall or execute."""

import hashlib
import io
import re
import stat
import tokenize
import unicodedata
import zipfile
import zlib
from dataclasses import dataclass, field
from pathlib import PurePosixPath

from .config import Settings
from .contracts import IgnoredFile, Language
from .errors import PipelineError

SUPPORTED = {".py": Language.PYTHON, ".java": Language.JAVA}
NOISE_DIRS = {".git", ".venv", "venv", "node_modules", "__pycache__", ".idea", ".mypy_cache"}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_path(name: str) -> str:
    if not name or len(name) > 500 or "\\" in name or any(ord(c) < 32 or ord(c) == 127 for c in name):
        raise PipelineError("unsafe_path", "Invalid source path")
    path = PurePosixPath(name)
    if (
        path.is_absolute()
        or any(p in {"", ".", ".."} for p in name.rstrip("/").split("/"))
        or re.match(r"^[a-zA-Z]:", name)
    ):
        raise PipelineError("unsafe_path", "Absolute and traversing paths are forbidden")
    return path.as_posix()


def decode_source(data: bytes, language: Language) -> tuple[str, str]:
    try:
        if language == Language.PYTHON:
            encoding, _ = tokenize.detect_encoding(io.BytesIO(data).readline)
        elif data.startswith((b"\xff\xfe", b"\xfe\xff")):
            encoding = "utf-16"
        else:
            encoding = "utf-8-sig" if data.startswith(b"\xef\xbb\xbf") else "utf-8"
        text = data.decode(encoding, errors="strict")
    except (UnicodeError, SyntaxError, LookupError) as exc:
        raise PipelineError(
            "invalid_encoding", "Source must have a valid declared Python encoding or Unicode Java encoding"
        ) from exc
    if any(ord(c) < 32 and c not in "\n\r\t\f" for c in text):
        raise PipelineError("binary_content", "Binary/control content is not accepted as source")
    return text, encoding


@dataclass(frozen=True)
class InputFile:
    path: str
    data: bytes
    language: Language
    encoding: str


@dataclass
class Collection:
    files: list[InputFile] = field(default_factory=list)
    ignored: list[IgnoredFile] = field(default_factory=list)


def collect_files(items: list[tuple[str, bytes]], settings: Settings, *, archive: bool = False) -> Collection:
    if not items:
        raise PipelineError("empty_input", "Provide at least one Python or Java file")
    if len(items) > settings.max_files:
        raise PipelineError("file_count_limit", "Too many input files", 413)
    result = Collection()
    seen: set[str] = set()
    total = 0
    for name, data in items:
        path = safe_path(name)
        canonical = unicodedata.normalize("NFC", path).casefold()
        if canonical in seen:
            raise PipelineError("duplicate_path", "Ambiguous or repeated file paths")
        seen.add(canonical)
        total += len(data)
        if len(data) > settings.max_file_bytes or total > settings.max_total_bytes:
            raise PipelineError("source_size_limit", "Source byte limit exceeded", 413)
        suffix = PurePosixPath(path).suffix.lower()
        if any(part in NOISE_DIRS for part in PurePosixPath(path).parts):
            result.ignored.append(IgnoredFile(relative_path=path, reason="noise_directory"))
            continue
        if suffix not in SUPPORTED:
            if not archive:
                raise PipelineError("unsupported_extension", "Only .py and .java files are supported", 415)
            result.ignored.append(IgnoredFile(relative_path=path, reason="unsupported_extension"))
            continue
        language = SUPPORTED[suffix]
        _, encoding = decode_source(data, language)
        result.files.append(InputFile(path, data, language, encoding))
    if not result.files:
        raise PipelineError("empty_input", "No supported source files found")
    result.files.sort(key=lambda f: f.path)
    result.ignored.sort(key=lambda f: f.relative_path)
    return result


def collect_zip(data: bytes, settings: Settings, *, strip_root: bool = False) -> Collection:
    if len(data) > settings.max_download_bytes:
        raise PipelineError("archive_size_limit", "Archive exceeds compressed byte limit", 413)
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            infos = archive.infolist()
            if len(infos) > settings.max_files * 2:
                raise PipelineError("file_count_limit", "Too many archive entries", 413)
            files = [i for i in infos if not i.is_dir()]
            if len(files) > settings.max_files:
                raise PipelineError("file_count_limit", "Too many archive files", 413)
            total = 0
            roots: set[str] = set()
            for entry in infos:
                if entry.orig_filename != entry.filename:
                    raise PipelineError("unsafe_path", "NUL in archive filename")
                path = safe_path(entry.filename)
                roots.add(path.split("/")[0])
                mode = entry.external_attr >> 16
                kind = stat.S_IFMT(mode)
                if kind not in {0, stat.S_IFREG, stat.S_IFDIR}:
                    raise PipelineError("unsafe_link", "Symlinks and special archive entries are forbidden")
                if entry.flag_bits & 1:
                    raise PipelineError("encrypted_archive", "Encrypted entries are unsupported")
                if entry.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
                    raise PipelineError(
                        "archive_compression", "Only stored and deflated ZIP entries are supported"
                    )
                total += entry.file_size
                if entry.file_size > settings.max_file_bytes or total > settings.max_total_bytes:
                    raise PipelineError("archive_expansion_limit", "Expanded archive is too large", 413)
                if entry.file_size / max(entry.compress_size, 1) > settings.max_archive_ratio:
                    raise PipelineError("archive_ratio_limit", "Suspicious archive compression ratio", 413)
            if strip_root and (len(roots) != 1 or any("/" not in i.filename for i in files)):
                raise PipelineError("archive_root", "GitHub archive must have a single root directory")
            items = []
            for entry in files:
                with archive.open(entry) as handle:
                    payload = handle.read(settings.max_file_bytes + 1)
                if len(payload) != entry.file_size or len(payload) > settings.max_file_bytes:
                    raise PipelineError(
                        "archive_expansion_limit", "Entry size differs from validated metadata", 413
                    )
                path = entry.filename.split("/", 1)[1] if strip_root else entry.filename
                items.append((path, payload))
            return collect_files(items, settings, archive=True)
    except (
        zipfile.BadZipFile,
        zipfile.LargeZipFile,
        EOFError,
        RuntimeError,
        NotImplementedError,
        OSError,
        zlib.error,
    ) as exc:
        raise PipelineError("invalid_archive", "Malformed or unsupported ZIP archive") from exc
