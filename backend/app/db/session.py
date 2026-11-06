from collections.abc import Generator

from sqlalchemy import create_engine, make_url
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.errors import DatabaseError, DatabaseTimeoutError

# SQLAlchemy 2.1 uses psycopg 3 for postgresql:// URLs, which returns other types (e.g. INET as ipaddress objects)
engine = create_engine(
    make_url(settings.DATABASE_URL).set(drivername="postgresql+psycopg2"),
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
