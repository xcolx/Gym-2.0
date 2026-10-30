from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.deps import DbSession

router = APIRouter()

@router.get("", status_code=200)
def check_health(db: Session = DbSession):
    try:
        db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "database": "connected"
        }
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed"
        ) from error
