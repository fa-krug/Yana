"""
Pydantic schemas for Aggregator endpoints.

Provides schemas for listing available aggregators.
"""

from pydantic import BaseModel, Field


class AggregatorSchema(BaseModel):
    """Schema for aggregator information."""

    id: str = Field(..., description="Aggregator ID (e.g., 'heise', 'full_website')")
    name: str = Field(..., description="Human-readable name")
    type: str = Field(..., description="Aggregator type: managed, custom, or social")
    description: str | None = Field(None, description="Description of the aggregator")
    url: str | None = Field(None, description="Default URL for this aggregator")
    icon: str | None = Field(None, description="Icon/favicon URL for this aggregator")
    feed_type: str | None = Field(
        None, description="Feed type: article, youtube, podcast, or reddit"
    )
    enabled: bool = Field(
        default=True, description="Whether this aggregator is available"
    )


class AggregatorListSchema(BaseModel):
    """Schema for grouped aggregator list."""

    managed: list[AggregatorSchema] = Field(
        default_factory=list, description="Managed aggregators for specific sites"
    )
    social: list[AggregatorSchema] = Field(
        default_factory=list, description="Social media aggregators"
    )
    custom: list[AggregatorSchema] = Field(
        default_factory=list, description="Generic/custom aggregators"
    )
