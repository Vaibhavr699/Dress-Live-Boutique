from fastapi import APIRouter
from app.api.v1.endpoints import auth, users, boutiques, dresses, shortlists, bookings

api_router = APIRouter()
api_router.include_router(auth.router, tags=["login"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(boutiques.router, prefix="/boutiques", tags=["boutiques"])
api_router.include_router(dresses.router, prefix="/dresses", tags=["dresses"])
api_router.include_router(shortlists.router, prefix="/shortlists", tags=["shortlists"])
api_router.include_router(bookings.router, prefix="/bookings", tags=["bookings"])
