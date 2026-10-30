from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.errors import DatabaseError, DatabaseTimeoutError

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


def get_db() -> Generator[Session]:
    """
    Must be used through DbSession (app.core.deps), so that the commit runs before the response is sent.
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except (PoolTimeoutError, OperationalError) as error:
        # No free connection in the pool within its timeout, or the database can't be reached or cancelled the
        # statement: a temporary problem, answered with 503 so that the clients try again later
        db.rollback()
        raise DatabaseTimeoutError("The database is busy or unavailable at the moment. Please try again.") from error
    except SQLAlchemyError as error:
        db.rollback()
        raise DatabaseError("An error occurred with the database operation. Please try again.") from error
    except Exception:
        # Application errors (404, 403, 401, ...) are passed through unchanged to their exception handlers
        db.rollback()
        raise
    finally:
        db.close()
