"""
Custom pagination classes for API v1.

Provides pagination that matches the frontend's expected response format.
"""

from typing import Any

from django.db.models import QuerySet
from django.http import HttpRequest
from ninja.pagination import PaginationBase


class CustomPageNumberPagination(PaginationBase):
    """
    Custom pagination class that returns format matching frontend expectations.

    Returns:
        {
            "items": [...],
            "count": total_count,
            "page": current_page,
            "page_size": items_per_page,
            "pages": total_pages
        }
    """

    # Pagination settings
    page_size: int = 20
    max_page_size: int = 100
    page_size_query_param: str = "page_size"

    class Input(PaginationBase.Input):
        page: int = 1
        page_size: int = 20

    class Output(PaginationBase.Output):
        items: list[Any]
        count: int
        page: int
        page_size: int
        pages: int

    def paginate_queryset(
        self,
        queryset: QuerySet | list,
        pagination: Input,
        request: HttpRequest,
        **params,
    ) -> dict:
        """
        Paginate a queryset or list and return formatted response.

        Args:
            queryset: Django QuerySet or list to paginate
            pagination: Pagination parameters (page, page_size)
            request: HTTP request object
            **params: Additional parameters

        Returns:
            Dictionary with paginated results matching Output schema
        """
        # Limit page_size to max_page_size
        page_size = min(pagination.page_size, self.max_page_size)
        page = max(pagination.page, 1)  # Ensure page is at least 1

        # Get total count - handle both QuerySet and list
        if isinstance(queryset, list):
            total = len(queryset)
        else:
            total = queryset.count()

        # Calculate total pages
        pages = (total + page_size - 1) // page_size if total > 0 else 1

        # Ensure page is within valid range
        page = min(page, pages)

        # Calculate offset
        offset = (page - 1) * page_size

        # Slice queryset or list
        if isinstance(queryset, list):
            items = queryset[offset : offset + page_size]
        else:
            items = list(queryset[offset : offset + page_size])

        return {
            "items": items,
            "count": total,
            "page": page,
            "page_size": page_size,
            "pages": pages,
        }
