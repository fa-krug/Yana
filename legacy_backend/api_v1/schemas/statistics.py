"""
Pydantic schemas for Statistics endpoints.

Provides schemas for dashboard statistics.
"""

from pydantic import BaseModel, Field


class StatisticsSchema(BaseModel):
    """Schema for dashboard statistics."""

    total_feeds: int = Field(..., description="Total number of feeds")
    total_articles: int = Field(..., description="Total number of articles")
    total_unread: int = Field(..., description="Total number of unread articles")
    read_percentage: int = Field(..., description="Percentage of articles read (0-100)")

    # Feed type breakdown
    article_feeds: int = Field(0, description="Number of article feeds")
    video_feeds: int = Field(0, description="Number of YouTube feeds")
    podcast_feeds: int = Field(0, description="Number of podcast feeds")
    reddit_feeds: int = Field(0, description="Number of Reddit feeds")

    # Recent activity
    articles_today: int = Field(0, description="Number of articles added today")
    articles_this_week: int = Field(0, description="Number of articles added this week")
