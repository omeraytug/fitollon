from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from fitollon.config import get_settings


@lru_cache
def get_engine() -> Engine:
    # Serverless functions are short-lived, so don't hold a pool open; Neon's pooler does the pooling.
    return create_engine(get_settings().sqlalchemy_url, poolclass=NullPool)


@contextmanager
def session_scope() -> Iterator[Session]:
    session = sessionmaker(bind=get_engine(), expire_on_commit=False)()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session() -> Iterator[Session]:
    """FastAPI dependency."""
    with session_scope() as session:
        yield session
