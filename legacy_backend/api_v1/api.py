"""
Main API router for v1 endpoints.

This module creates the NinjaAPI instance and registers all endpoint routers.
"""

from ninja import NinjaAPI
from ninja.security import SessionAuth

from api_v1.endpoints.aggregators import router as aggregators_router
from api_v1.endpoints.articles import router as articles_router
from api_v1.endpoints.auth import router as auth_router
from api_v1.endpoints.feeds import router as feeds_router
from api_v1.endpoints.statistics import router as statistics_router

# Create API instance with automatic OpenAPI schema generation
# Use SessionAuth for Django session-based authentication
api = NinjaAPI(
    version="1.0.0",
    title="Yana API",
    description="RESTful API for Yana RSS feed aggregator",
    docs_url="/docs",  # Swagger UI at /api/v1/docs
    csrf=True,  # Enable CSRF protection for cookie-based auth
    auth=SessionAuth(),  # Global authentication using Django sessions
)

# Register routers
# Auth router doesn't need authentication (login/status endpoints)
api.add_router("/auth/", auth_router, tags=["Authentication"], auth=None)
# All other routers use global SessionAuth
api.add_router("/feeds/", feeds_router, tags=["Feeds"])
api.add_router(
    "/", articles_router, tags=["Articles"]
)  # Articles endpoints at root level
api.add_router("/aggregators/", aggregators_router, tags=["Aggregators"])
api.add_router("/statistics/", statistics_router, tags=["Statistics"])
