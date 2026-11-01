"""Initial immutable snapshot metadata and persistent job results."""

import sqlalchemy as sa
from alembic import op

revision = "0001_phase_one"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_table(
        "snapshots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index("ix_snapshots_project_id", "snapshots", ["project_id"])
    op.create_table(
        "source_files",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("snapshot_id", sa.String(36), sa.ForeignKey("snapshots.id"), nullable=False),
        sa.Column("relative_path", sa.String(500), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.UniqueConstraint("snapshot_id", "relative_path"),
    )
    op.create_index("ix_source_files_snapshot_id", "source_files", ["snapshot_id"])
    op.create_index("ix_source_files_content_hash", "source_files", ["content_hash"])
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("parameters", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
    )


def downgrade():
    op.drop_table("jobs")
    op.drop_table("source_files")
    op.drop_table("snapshots")
    op.drop_table("projects")
