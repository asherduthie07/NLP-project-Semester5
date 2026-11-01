import io
import stat
import zipfile

import pytest
from hypothesis import given
from hypothesis import strategies as st

from backend.codeatlas.errors import PipelineError
from backend.codeatlas.ingestion import collect_files, collect_zip, decode_source, digest, safe_path
from backend.codeatlas.storage import ArtifactStore
from tests.conftest import zip_bytes


def test_python_java_and_original_bytes(settings):
    raw = b"# coding: latin-1\r\n# caf\xe9\r\nx = 1\r\n"
    result = collect_files([("main.py", raw), ("Main.java", b"class Main {}")], settings)
    assert len(result.files) == 2
    file = next(f for f in result.files if f.path == "main.py")
    assert file.data == raw
    assert decode_source(raw, file.language) == (raw.decode("iso-8859-1"), "iso-8859-1")
    store = ArtifactStore(settings.storage_root)
    key = store.put(raw)
    assert key == digest(raw) and store.get(key) == raw
    assert store.put(raw) == key
    with pytest.raises(PipelineError):
        store.get("../file")


def test_mixed_zip_ignored_and_empty_files(settings):
    result = collect_zip(
        zip_bytes(
            {"src/a.py": b"", "src/A.java": b"class A {}", "readme.md": b"notes", ".git/hook.py": b"bad"}
        ),
        settings,
    )
    assert [f.path for f in result.files] == ["src/A.java", "src/a.py"]
    assert {i.reason for i in result.ignored} == {"unsupported_extension", "noise_directory"}


@pytest.mark.parametrize(
    "items,code",
    [
        ([], "empty_input"),
        ([("a.txt", b"x")], "unsupported_extension"),
        ([("a.py", b"\x00")], "binary_content"),
        ([("a.py", b"\xff")], "invalid_encoding"),
        ([("A.py", b""), ("a.py", b"")], "duplicate_path"),
    ],
)
def test_bad_files(settings, items, code):
    with pytest.raises(PipelineError) as exc:
        collect_files(items, settings)
    assert exc.value.code == code


@pytest.mark.parametrize(
    "path", ["../a.py", "/a.py", "a/../../x.py", "C:/a.py", "a\\b.py", "a/./b.py", "a//b.py", "a\x00.py"]
)
def test_traversal(settings, path):
    with pytest.raises(PipelineError) as exc:
        payload = (
            zip_bytes({"aX.py": b"x=1"}).replace(b"aX.py", b"a\x00.py")
            if "\x00" in path
            else zip_bytes({path: b"x=1"})
        )
        collect_zip(payload, settings)
    assert exc.value.code == "unsafe_path"


def test_malformed_zip(settings):
    for payload in [b"", b"not zip", zip_bytes({"a.py": b"x"})[:20]]:
        with pytest.raises(PipelineError):
            collect_zip(payload, settings)


def test_symlinks_and_special_files(settings):
    for mode in [stat.S_IFLNK | 0o777, stat.S_IFIFO | 0o600]:
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            entry = zipfile.ZipInfo("a.py")
            entry.create_system = 3
            entry.external_attr = mode << 16
            archive.writestr(entry, "../../etc/passwd")
        with pytest.raises(PipelineError) as exc:
            collect_zip(stream.getvalue(), settings)
        assert exc.value.code == "unsafe_link"


def test_limits(settings):
    cases = [
        (settings.model_copy(update={"max_files": 1}), {"a.py": b"x", "b.py": b"y"}, "file_count_limit"),
        (settings.model_copy(update={"max_file_bytes": 2}), {"a.py": b"123"}, "archive_expansion_limit"),
        (
            settings.model_copy(update={"max_total_bytes": 3}),
            {"a.py": b"12", "b.py": b"12"},
            "archive_expansion_limit",
        ),
        (settings, {"a.py": b" " * 100000}, "archive_ratio_limit"),
        (settings.model_copy(update={"max_download_bytes": 2}), {"a.py": b"x"}, "archive_size_limit"),
    ]
    for config, items, code in cases:
        with pytest.raises(PipelineError) as exc:
            collect_zip(zip_bytes(items), config)
        assert exc.value.code == code


def test_duplicate_archive_paths(settings):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("a.py", "x")
        archive.writestr("A.py", "y")
    with pytest.raises(PipelineError, match="Ambiguous"):
        collect_zip(stream.getvalue(), settings)


def test_storage_symlink_and_tamper(settings, tmp_path):
    store = ArtifactStore(settings.storage_root)
    data = b"x=1"
    key = digest(data)
    target = tmp_path / "outside"
    target.write_bytes(data)
    (store.root / key).symlink_to(target)
    with pytest.raises(PipelineError):
        store.put(data)
    assert target.read_bytes() == data
    with pytest.raises(PipelineError):
        ArtifactStore(store.root / key)


@given(st.binary(max_size=4096))
def test_hash_consistency(data):
    import hashlib

    assert digest(data) == hashlib.sha256(data).hexdigest()


@given(st.lists(st.text(alphabet="abcXYZ012_-", min_size=1, max_size=12), min_size=1, max_size=5))
def test_safe_relative_paths(parts):
    path = "/".join(parts) + ".py"
    assert safe_path(path) == path
