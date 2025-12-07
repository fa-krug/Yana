"""
Content extraction functionality for aggregators.

This module provides the ExtractionMixin which handles extracting the main
article content from fetched HTML. Aggregators override the extract_content
method to implement site-specific extraction logic.
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import RawArticle


class ExtractionMixin:
    """
    Mixin providing content extraction functionality for aggregators.

    This mixin provides the extract_content method which is the most commonly
    overridden method by aggregators. It extracts the main content from the
    fetched HTML using site-specific CSS selectors or other strategies.
    """

    def extract_content(self, article: "RawArticle") -> None:  # noqa: B027
        """
        Extract the main article content from HTML.

        THIS IS THE MOST COMMONLY OVERRIDDEN METHOD.
        Override this to extract content using site-specific selectors.

        Reads from article.html and updates it with extracted content.

        Args:
            article: The article being processed (reads/writes article.html)

        Example:
            >>> def extract_content(self, article: RawArticle) -> None:
            ...     soup = BeautifulSoup(article.html, "html.parser")
            ...     content = soup.select_one(".article-content")
            ...     if content:
            ...         article.html = str(content)
        """
        pass  # Default: keep full HTML
