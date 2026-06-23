from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.ai_job import AIJob
from app.schemas.ai_job import AIJobCreate


class CRUDAIJob:
    def get(self, db: Session, id: int) -> Optional[AIJob]:
        return db.query(AIJob).filter(AIJob.id == id).first()

    def get_by_provider_job_id(
        self, db: Session, *, provider: str, provider_job_id: str
    ) -> Optional[AIJob]:
        return (
            db.query(AIJob)
            .filter(
                AIJob.provider == provider,
                AIJob.provider_job_id == provider_job_id,
            )
            .first()
        )

    def create(self, db: Session, *, obj_in: AIJobCreate) -> AIJob:
        db_obj = AIJob(
            kind=obj_in.kind,
            provider=obj_in.provider,
            input=obj_in.input or {},
            dress_id=obj_in.dress_id,
            booking_id=obj_in.booking_id,
            parent_job_id=obj_in.parent_job_id,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def mark_submitted(
        self, db: Session, *, db_obj: AIJob, provider_job_id: str
    ) -> AIJob:
        db_obj.status = "submitted"
        db_obj.provider_job_id = provider_job_id
        db_obj.attempts = (db_obj.attempts or 0) + 1
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def mark_completed(
        self, db: Session, *, db_obj: AIJob, result: Dict[str, Any]
    ) -> AIJob:
        db_obj.status = "completed"
        db_obj.result = result
        db_obj.error = None
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def mark_failed(self, db: Session, *, db_obj: AIJob, error: str) -> AIJob:
        db_obj.status = "failed"
        db_obj.error = error
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj


crud_ai_job = CRUDAIJob()
