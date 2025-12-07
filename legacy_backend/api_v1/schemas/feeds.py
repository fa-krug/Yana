"""
Pydantic schemas for Feed endpoints.

Provides request and response schemas for feed CRUD operations.
"""

from datetime import datetime

from pydantic import BaseModel, Field


# Base schemas
class FeedBase(BaseModel):
    """Base schema with common feed fields."""

    name: str = Field(..., max_length=255, description="Name of the feed")
    identifier: str = Field(
        ...,
        max_length=500,
        description="Feed identifier (URL for RSS, subreddit name for Reddit, channel for YouTube)",
    )
    feed_type: str = Field(
        default="article",
        description="Type of feed: article, youtube, podcast, or reddit",
    )
    aggregator: str = Field(
        ..., max_length=255, description="Aggregator ID (e.g., 'heise', 'default')"
    )
    enabled: bool = Field(default=True, description="Whether the feed is enabled")
    generate_title_image: bool = Field(
        default=True, description="Extract and display header image"
    )
    add_source_footer: bool = Field(
        default=True, description="Add source link at bottom"
    )
    skip_duplicates: bool = Field(
        default=True, description="Skip articles with duplicate titles"
    )
    use_current_timestamp: bool = Field(
        default=True, description="Use current time instead of RSS feed date"
    )
    daily_post_limit: int = Field(
        default=50,
        description="Daily post target: -1=unlimited, 0=disabled, n>0=~n posts/day",
    )
    aggregator_options: dict = Field(
        default_factory=dict, description="Configuration options for the aggregator"
    )


# Request schemas
class FeedCreateRequest(FeedBase):
    """Schema for creating a new feed."""

    icon: str | None = Field(default=None, max_length=500, description="Feed icon URL")


class FeedUpdateRequest(BaseModel):
    """Schema for updating an existing feed."""

    name: str | None = Field(None, max_length=255, description="Name of the feed")
    enabled: bool | None = Field(None, description="Whether the feed is enabled")
    generate_title_image: bool | None = Field(
        None, description="Extract and display header image"
    )
    add_source_footer: bool | None = Field(
        None, description="Add source link at bottom"
    )
    skip_duplicates: bool | None = Field(
        None, description="Skip articles with duplicate titles"
    )
    use_current_timestamp: bool | None = Field(
        None, description="Use current time instead of RSS feed date"
    )
    daily_post_limit: int | None = Field(
        None,
        description="Daily post target: -1=unlimited, 0=disabled, n>0=~n posts/day",
    )
    aggregator_options: dict | None = Field(
        None, description="Configuration options for the aggregator"
    )
    icon: str | None = Field(None, max_length=500, description="Feed icon URL")


# Response schemas
class FeedSchema(FeedBase):
    """Schema for feed response."""

    id: int
    icon: str | None = None
    user_id: int | None = Field(None, description="User who owns this feed")
    created_at: datetime
    updated_at: datetime
    article_count: int | None = Field(
        None, description="Number of articles (only in list view)"
    )
    unread_count: int | None = Field(
        None, description="Number of unread articles (only in list view)"
    )

    model_config = {"from_attributes": True}


class FeedDetailSchema(FeedSchema):
    """Schema for detailed feed view with additional metadata."""

    example: str | None = Field(None, description="Example article HTML for reference")
    aggregator_metadata: dict | None = Field(
        None, description="Metadata from the aggregator"
    )


class FeedListSchema(BaseModel):
    """Schema for paginated feed list response."""

    feeds: list[FeedSchema]
    total: int
    page: int
    page_size: int


# Operation response schemas
class FeedOperationResponse(BaseModel):
    """Generic response for feed operations."""

    success: bool
    message: str
    feed_id: int | None = None


class FeedReloadResponse(BaseModel):
    """Response for feed reload operation."""

    success: bool
    message: str
    articles_added: int
    articles_updated: int = Field(default=0)
    articles_skipped: int = Field(default=0)
    errors: list[str] = Field(default_factory=list)


# Preview schemas
class FeedPreviewRequest(FeedBase):
    """Schema for previewing a feed configuration."""

    icon: str | None = Field(default=None, max_length=500, description="Feed icon URL")


class PreviewArticle(BaseModel):
    """Schema for preview article."""

    title: str
    content: str = Field(..., description="Truncated article content (~300 chars)")
    published: datetime | None = None
    author: str | None = None
    thumbnail_url: str | None = None
    link: str


class FeedPreviewResponse(BaseModel):
    """Response for feed preview operation."""

    success: bool
    articles: list[PreviewArticle] = Field(default_factory=list)
    count: int = Field(0, description="Number of articles returned")
    error: str | None = Field(None, description="Error message if preview failed")
    error_type: str | None = Field(
        None,
        description="Error type: validation, network, parse, authentication, timeout, unknown",
    )
