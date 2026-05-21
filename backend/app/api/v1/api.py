from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    users,
    boutiques,
    dresses,
    shortlists,
    bookings,
    video_calls,
    ai,
    notifications,
    webhooks,
    orders,
    partner_stripe,
    stripe_webhooks,
)

api_router = APIRouter()
api_router.include_router(auth.router, tags=["login"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(boutiques.router, prefix="/boutiques", tags=["boutiques"])
api_router.include_router(dresses.router, prefix="/dresses", tags=["dresses"])
api_router.include_router(shortlists.router, prefix="/shortlists", tags=["shortlists"])
api_router.include_router(bookings.router, prefix="/bookings", tags=["bookings"])
api_router.include_router(video_calls.router, prefix="/video-calls", tags=["video-calls"])
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
api_router.include_router(partner_stripe.router, prefix="/partners/stripe", tags=["partner-stripe"])
api_router.include_router(stripe_webhooks.router, prefix="/webhooks", tags=["stripe-webhooks"])
