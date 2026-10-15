from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

JsonType = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    pass


class DailyMetric(Base):
    """One value per day per metric, e.g. step_count, dietary_energy, heart_rate.avg.

    Metric names are kept as the source sends them (Health Auto Export uses snake_case names);
    multi-value metrics are split into "<name>.<field>" rows (heart_rate.min / .avg / .max).
    """

    __tablename__ = "daily_metrics"
    __table_args__ = (UniqueConstraint("day", "metric", "provider"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    metric: Mapped[str] = mapped_column(String(120), index=True)
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(String(40))
    provider: Mapped[str] = mapped_column(String(40))  # apple_health | macrofactor | manual
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Workout(Base):
    """Workouts recorded by Apple Health / Apple Watch."""

    __tablename__ = "workouts"

    id: Mapped[int] = mapped_column(primary_key=True)
    external_id: Mapped[str] = mapped_column(String(120), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    start: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_s: Mapped[float | None] = mapped_column(Float)
    active_energy_kcal: Mapped[float | None] = mapped_column(Float)
    avg_heart_rate: Mapped[float | None] = mapped_column(Float)
    max_heart_rate: Mapped[float | None] = mapped_column(Float)
    distance_km: Mapped[float | None] = mapped_column(Float)
    provider: Mapped[str] = mapped_column(String(40), default="apple_health")
    raw: Mapped[dict[str, Any] | None] = mapped_column(JsonType)


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    muscle_group: Mapped[str | None] = mapped_column(String(80))
    notes: Mapped[str | None] = mapped_column(Text)
    # How weight_kg is meant for this exercise: "total" (whole bar/stack) or "per_side" (per dumbbell/side).
    load_type: Mapped[str] = mapped_column(String(20), default="total", server_default="total")


class WorkoutTemplate(Base):
    """One session of the training cycle (e.g. "Upper A"); position gives the order within the cycle."""

    __tablename__ = "workout_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)

    exercises: Mapped[list["TemplateExercise"]] = relationship(
        back_populates="template", cascade="all, delete-orphan", order_by="TemplateExercise.position"
    )


class TemplateExercise(Base):
    """A planned exercise in a template: how many sets, which rep range, how close to failure."""

    __tablename__ = "template_exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("workout_templates.id", ondelete="CASCADE"), index=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"))
    position: Mapped[int] = mapped_column(Integer)
    sets: Mapped[int | None] = mapped_column(Integer)
    rep_min: Mapped[int | None] = mapped_column(Integer)
    rep_max: Mapped[int | None] = mapped_column(Integer)
    rir_target: Mapped[str | None] = mapped_column(String(20))  # e.g. "1" or "0-1"
    notes: Mapped[str | None] = mapped_column(Text)  # setup cues, e.g. "seat 7"

    template: Mapped[WorkoutTemplate] = relationship(back_populates="exercises")
    exercise: Mapped[Exercise] = relationship()


class TrainingSession(Base):
    """A strength/gym session (from the app or the AI chat)."""

    __tablename__ = "training_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    title: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(40), default="app")  # app | chat
    template_id: Mapped[int | None] = mapped_column(ForeignKey("workout_templates.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sets: Mapped[list["TrainingSet"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="TrainingSet.position"
    )
    template: Mapped[WorkoutTemplate | None] = relationship()


class TrainingSet(Base):
    __tablename__ = "training_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("training_sessions.id", ondelete="CASCADE"), index=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), index=True)
    # The plan slot this set was logged in: the planned exercise (which differs from exercise_id when the
    # user swapped it) and which occurrence of it in the template (a template can list "Biceps of choice" twice).
    planned_exercise_id: Mapped[int | None] = mapped_column(ForeignKey("exercises.id"))
    plan_occurrence: Mapped[int | None] = mapped_column(Integer)
    position: Mapped[int] = mapped_column(Integer)  # order within the session
    reps: Mapped[int | None] = mapped_column(Integer)
    weight_kg: Mapped[float | None] = mapped_column(Float)  # per the exercise's load_type
    rir: Mapped[float | None] = mapped_column(Float)
    rpe: Mapped[float | None] = mapped_column(Float)
    duration_s: Mapped[float | None] = mapped_column(Float)
    distance_m: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)

    session: Mapped[TrainingSession] = relationship(back_populates="sets")
    exercise: Mapped[Exercise] = relationship(foreign_keys=[exercise_id])
    planned_exercise: Mapped[Exercise | None] = relationship(foreign_keys=[planned_exercise_id])


class Profile(Base):
    """Single row (id=1): what the AI coach should always know about you."""

    __tablename__ = "profile"

    id: Mapped[int] = mapped_column(primary_key=True)
    about: Mapped[str] = mapped_column(Text, default="")
    goals: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Memory(Base):
    """Facts the AI coach chose to remember across conversations."""

    __tablename__ = "ai_memories"

    id: Mapped[int] = mapped_column(primary_key=True)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    # The Strands agent's message history, stored as-is so a conversation can be resumed.
    messages: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), index=True
    )


class IngestEvent(Base):
    """Every sync payload received, kept so it can be re-processed if a parser improves."""

    __tablename__ = "ingest_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    source: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20))  # ok | error
    summary: Mapped[dict[str, Any] | None] = mapped_column(JsonType)
    error: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JsonType)
