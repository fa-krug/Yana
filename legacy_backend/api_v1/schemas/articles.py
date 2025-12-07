"""
Pydantic schemas for Article endpoints.

Provides request and response schemas for article operations.
"""

from datetime import datetime

from pydantic import BaseModel, Field


# Response schemas
class ArticleSchema(BaseModel):
    """Schema for article response."""

    id: int
    feed_id: int = Field(..., description="ID of the feed this article belongs to")
    name: str = Field(..., max_length=500, description="Article title")
    url: str = Field(..., max_length=1000, description="Article URL")
    date: datetime = Field(..., description="Publication date")
    content: str = Field(..., description="Article HTML content")

    # Media metadata
    thumbnail_url: str | None = Field(None, description="Thumbnail/preview image URL")
    media_url: str | None = Field(None, description="Direct URL to media")
    duration: int | None = Field(None, description="Duration in seconds")
    view_count: int | None = Field(None, description="View count (YouTube)")
    media_type: str | None = Field(None, description="MIME type of media")

    # Social media fields
    author: str | None = Field(None, description="Author/creator name")
    external_id: str | None = Field(None, description="External platform ID")
    score: int | None = Field(None, description="Score/rating (Reddit upvotes)")

    # Computed fields
    is_video: bool = Field(False, description="Is this a video (YouTube)")
    is_podcast: bool = Field(False, description="Is this a podcast episode")
    is_reddit: bool = Field(False, description="Is this a Reddit post")
    has_media: bool = Field(False, description="Has embedded media")
    duration_formatted: str | None = Field(None, description="Formatted duration")

    # Read state
    is_read: bool = Field(False, description="Is this article read by current user")
    is_saved: bool = Field(False, description="Is this article saved by current user")

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ArticleListItemSchema(BaseModel):
    """Schema for article in list view (minimal fields)."""

    id: int
    feed_id: int
    name: str
    url: str
    date: datetime
    author: str | None = None
    thumbnail_url: str | None = None
    duration_formatted: str | None = None
    view_count: int | None = None
    score: int | None = None
    is_video: bool = False
    is_podcast: bool = False
    is_reddit: bool = False
    is_read: bool = False
    is_saved: bool = False

    model_config = {"from_attributes": True}


class ArticleListSchema(BaseModel):
    """Schema for paginated article list response."""

    articles: list[ArticleListItemSchema]
    total: int
    page: int
    page_size: int
    has_previous: bool
    has_next: bool


class ArticleDetailSchema(ArticleSchema):
    """Schema for detailed article view with navigation."""

    feed_name: str = Field(..., description="Name of the feed")
    feed_icon: str | None = Field(None, description="Feed icon URL")
    prev_article_id: int | None = Field(None, description="Previous article ID")
    next_article_id: int | None = Field(None, description="Next article ID")


# Operation response schemas
class ArticleOperationResponse(BaseModel):
    """Generic response for article operations."""

    success: bool
    message: str
    article_id: int | None = None


class ArticleReloadResponse(BaseModel):
    """Response for article reload operation."""

    success: bool
    message: str
    updated: bool


class MarkReadRequest(BaseModel):
    """Request to mark articles as read/unread."""

    article_ids: list[int]
    is_read: bool = True


class MarkSavedRequest(BaseModel):
    """Request to mark articles as saved/unsaved."""

    article_ids: list[int]
    is_saved: bool = True


class BulkOperationResponse(BaseModel):
    """Response for bulk operations."""

    success: bool
    message: str
    count: int
