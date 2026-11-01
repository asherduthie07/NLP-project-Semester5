import pytest
from pydantic import ValidationError

from backend.codeatlas.contracts import Position, PreprocessingConfig, SourceFile


def test_contracts_frozen_strict_version_and_locations():
    with pytest.raises(ValidationError):
        Position(line=0, column=-1)
    with pytest.raises(ValidationError):
        PreprocessingConfig(unknown=True)
    with pytest.raises(ValidationError):
        Position(line=1, column=0, schema_version="2.0")
    with pytest.raises(ValidationError):
        Position(line=1, column=0).line = 3
    assert "content_hash" in SourceFile.model_json_schema()["required"]
