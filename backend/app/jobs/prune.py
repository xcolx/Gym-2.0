"""
Runs maintenance_service.remove_old_data every day at PRUNE_TIME, as its own container (the maintenance service in
docker-compose.prod.yml):

    python -m app.jobs.prune           # runs every day at PRUNE_TIME until it is stopped
    python -m app.jobs.prune --once    # runs once right away, e.g. by hand
"""
import argparse
import logging
import time
from datetime import UTC, datetime, timedelta

from app.db.session import SessionLocal
from app.services import maintenance_service

# Before the nightly backup at 03:00 UTC (infra/backup/backup.crontab), so the backup doesn't contain the removed data
PRUNE_TIME = (1, 0)  # hour, minute in UTC

logger = logging.getLogger("app.jobs.prune")


def prune() -> None:
    """Removes the old data in one transaction. The images are removed once it is committed."""
    with SessionLocal() as session:
        removed, kept_exercises = maintenance_service.remove_old_data(session)
        session.commit()
    logger.info(
        "Removed %s. Kept %d deleted exercises that workouts or schemes still use.",
        ", ".join(f"{count} {label}" for label, count in removed.items()), kept_exercises,
    )


def next_run(now: datetime) -> datetime:
    run = now.replace(hour=PRUNE_TIME[0], minute=PRUNE_TIME[1], second=0, microsecond=0)
    return run if run > now else run + timedelta(days=1)


def run_forever() -> None:
    while True:
        run = next_run(datetime.now(UTC))
        logger.info("Next run at %s.", run.isoformat())
        # Slept in steps, so the run doesn't drift if the machine was suspended
        while (remaining := (run - datetime.now(UTC)).total_seconds()) > 0:
            time.sleep(min(remaining, 60))
        try:
            prune()
        except Exception:
            # Logged and tried again the next day, the container keeps running
            logger.exception("Removing old data failed.")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="Removes old soft deleted data, unverified accounts and expired sessions.")
    parser.add_argument("--once", action="store_true", help="run once right away instead of every day")
    if parser.parse_args().once:
        prune()
    else:
        run_forever()


if __name__ == "__main__":
    main()
