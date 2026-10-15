from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache

from fastapi import Depends
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from fitollon.config import get_settings


@lru_cache
def get_engine() -> Engine:
    # Serverless functions are short-lived, so don't hold a pool open; Neon's pooler does the pooling.
    # prepare_threshold=None: no server-side prepared statements, which a transaction-mode pooler can't track.
    return create_engine(get_settings().sqlalchemy_url, poolclass=NullPool, connect_args={"prepare_threshold": None})


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


# Route parameter default. scope="function" commits before the response is sent, so the client's next request
# already sees the change and a failed commit becomes an error response instead of a silent 200.
DbSession = Depends(get_session, scope="function")
