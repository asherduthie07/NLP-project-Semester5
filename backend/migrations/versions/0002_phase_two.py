"""Persist source-linked structural symbols and typed relationships."""

import sqlalchemy as sa
from alembic import op

revision = "0002_phase_two"
down_revision = "0001_phase_one"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "analysis_symbols",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("snapshot_id", sa.String(36), sa.ForeignKey("snapshots.id"), nullable=False),
        sa.Column("job_id", sa.String(36), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("file_id", sa.String(36), sa.ForeignKey("source_files.id"), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    for name in ("snapshot_id", "job_id", "file_id", "kind"):
        op.create_index(f"ix_analysis_symbols_{name}", "analysis_symbols", [name])
    op.create_table(
        "analysis_relationships",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("snapshot_id", sa.String(36), sa.ForeignKey("snapshots.id"), nullable=False),
        sa.Column("job_id", sa.String(36), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("resolution", sa.String(32), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    for name in ("snapshot_id", "job_id", "kind", "resolution"):
        op.create_index(f"ix_analysis_relationships_{name}", "analysis_relationships", [name])


def downgrade():
    op.drop_table("analysis_relationships")
    op.drop_table("analysis_symbols")
