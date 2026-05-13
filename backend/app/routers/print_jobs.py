from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth.dependencies import get_current_user
from app.database import get_session
from app.models.app_models import PrintJob, Usuario

router = APIRouter(prefix="/api/print-jobs", tags=["PrintJobs"])


class PrintJobIn(BaseModel):
    payload_b64: str


@router.post("", status_code=201)
def create_job(
    body: PrintJobIn,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    job = PrintJob(user_id=user.id, payload_b64=body.payload_b64)
    db.add(job)
    db.commit()
    db.refresh(job)
    return {"id": job.id}


@router.get("/pending")
def get_pending(
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    jobs = db.exec(
        select(PrintJob).where(
            PrintJob.user_id == user.id,
            PrintJob.status == "pending",
        )
    ).all()
    return [{"id": j.id, "payload_b64": j.payload_b64} for j in jobs]


@router.post("/{job_id}/done", status_code=200)
def mark_done(
    job_id: int,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    job = db.get(PrintJob, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    job.status = "done"
    db.commit()
    return {"ok": True}
