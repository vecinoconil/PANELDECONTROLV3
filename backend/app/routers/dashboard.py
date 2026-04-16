from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.models.app_models import Usuario

router = APIRouter()


@router.get("/summary")
def get_summary(current_user: Usuario = Depends(get_current_user)):
    return {
        "message": f"Bienvenido {current_user.nombre}",
        "stats": {
            "total_items": 0,
            "pending": 0,
            "completed": 0,
        },
    }
