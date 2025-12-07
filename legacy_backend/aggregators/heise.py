"""Aggregator for Heise RSS feeds."""

import contextlib
import html as html_module
import json
import re
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from .base import BaseAggregator, RawArticle, fetch_article_content
from .base.exceptions import ContentFetchError


class HeiseAggregatorConfig(BaseModel):
    id: str
    type: str = Field(pattern="^(managed|custom|social)$")
    name: str = Field(min_length=1)
    url: str = ""
    description: str = Field(min_length=1)
    wait_for_selector: str | None = None
    selectors_to_remove: list[str] = Field(default_factory=list)
    options: dict = Field(default_factory=dict)


class HeiseAggregator(BaseAggregator):
    """Aggregator for Heise.de (German tech news)."""

    id = "heise"
    type = "managed"
    name = "Heise"
    url = "https://www.heise.de/rss/heise.rdf"
    description = "Specialized aggregator for Heise.de (German tech news). Extracts article content, removes ads and tracking elements, and filters out premium content and image galleries."
    options = {
        "traverse_multipage": {
            "type": "boolean",
            "label": "Traverse multi-page articles",
            "help_text": "Fetch and inline all pages of multi-page articles into a single article",
            "default": False,
        },
        "max_comments": {
            "type": "integer",
            "label": "Maximum comments to extract",
            "help_text": "Number of comments to extract and inline at the end of articles (0 to disable)",
            "default": 0,
            "min": 0,
            "max": 100,
        },
    }

    wait_for_selector = "#meldung, .StoryContent"
    selectors_to_remove = [
        ".ad-label",
        ".ad",
        ".article-sidebar",
        "section",
        "a[name='meldung.ho.bottom.zurstartseite']",
        "a-img",
        ".a-article-header__lead",
        ".a-article-header__title",
        ".a-article-header__publish-info",
        ".a-article-header__service",
        "div[data-component='RecommendationBox']",
        ".opt-in__content-container",
        ".a-box",
        "iframe",
        ".a-u-inline",
        ".redakteurskuerzel",
        ".branding",
        "a-gift",
        "aside",
        "script",
        "style",
        "noscript",
        "footer",
        ".rte__list",
        "#wtma_teaser_ho_vertrieb_inline_branding",
    ]

    def __init__(self):
        super().__init__()
        HeiseAggregatorConfig(
            id=self.id,
            type=self.type,
            name=self.name,
            url=self.url,
            description=self.description,
            wait_for_selector=self.wait_for_selector,
            selectors_to_remove=self.selectors_to_remove,
            options=self.options,
        )

    def should_skip_article(self, article: RawArticle) -> tuple[bool, str | None]:
        """Skip unwanted content types."""
        skip_terms = [
            "die Bilder der Woche",
            "Produktwerker",
            "heise-Angebot",
            "#TGIQF",
            "heise+",
            "#heiseshow:",
            "Mein Scrum ist kaputt",
            "software-architektur.tv",
            "Developer Snapshots",
        ]

        if any(term in article.title for term in skip_terms):
            return True, f"Skipping filtered content: {article.title}"

        return super().should_skip_article(article)

    def fetch_article_html(self, article: RawArticle) -> str:
        """Fetch HTML, optionally using multi-page URL."""
        url = article.url

        # Convert to all-pages URL if option enabled
        if self.get_option("traverse_multipage", False):
            url = self._convert_to_all_pages_url(url)
            self.logger.info(f"Using all-pages URL: {url}")

        return fetch_article_content(
            url,
            use_cache=not self.force_refresh,
            wait_for_selector=self.wait_for_selector,
            timeout=self.fetch_timeout,
        )

    def _convert_to_all_pages_url(self, url: str) -> str:
        """Convert URL to 'all pages on one page' version."""
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        params["seite"] = ["all"]
        new_query = urlencode(params, doseq=True)
        return urlunparse(
            (
                parsed.scheme,
                parsed.netloc,
                parsed.path,
                parsed.params,
                new_query,
                parsed.fragment,
            )
        )

    def extract_content(self, article: RawArticle) -> None:
        """Extract content from #meldung or .StoryContent."""
        soup = BeautifulSoup(article.html, "html.parser")

        story = soup.select_one("#meldung, .StoryContent")
        if not story:
            self.logger.warning("Could not find #meldung or .StoryContent")
            return  # Keep full HTML

        content = BeautifulSoup(str(story), "html.parser")

        # Remove empty elements
        for tag in content.find_all(["p", "div", "span"]):
            if not tag.get_text(strip=True) and not tag.find("img"):
                tag.decompose()

        article.html = str(content)

    def process_article(self, article: RawArticle, is_first: bool = False) -> str:
        """Process article with optional comments extraction."""
        # Standard processing
        content = super().process_article(article, is_first)

        # Add comments if enabled
        max_comments = self.get_option("max_comments", 0)
        if max_comments > 0:
            self.logger.info(f"Extracting up to {max_comments} comments")
            try:
                # Get raw HTML again for comment extraction
                raw_html = self.fetch_article_html(article)
                comments_html, forum_url = self._extract_comments(
                    article.url, raw_html, max_comments
                )
                if comments_html:
                    content = f"{content}\n\n{comments_html}"
                elif forum_url:
                    # Show "no comments" message when enabled but none found
                    no_comments_html = f'<h3><a href="{forum_url}">Comments</a></h3>\n<p><em>No comments available for this article.</em></p>'
                    content = f"{content}\n\n{no_comments_html}"
            except ContentFetchError as e:
                self.logger.warning(
                    f"Failed to fetch article HTML for comment extraction: {e}"
                )
                # Comments are optional, continue without them
            except Exception as e:
                self.logger.error(f"Failed to extract comments: {e}")

        return content

    def _extract_comments(
        self, article_url: str, article_html: str, max_comments: int
    ) -> tuple[str, str | None]:
        """Extract comments from a Heise article.

        Returns:
            Tuple of (comments_html, forum_url)
        """
        # Extract forum URL from article HTML
        forum_url = self._extract_forum_url(article_html, article_url)
        if not forum_url:
            self.logger.info("No forum URL found in article")
            return "", None

        self.logger.info(f"Fetching comments from forum: {forum_url}")

        # Fetch the forum page
        try:
            html = fetch_article_content(
                forum_url,
                use_cache=not self.force_refresh,
                wait_for_selector="body",
                timeout=30000,
            )
        except ContentFetchError as e:
            self.logger.warning(f"Failed to fetch comments from {forum_url}: {e}")
            return "", forum_url
        except Exception as e:
            self.logger.warning(
                f"Unexpected error fetching comments from {forum_url}: {e}"
            )
            return "", forum_url

        soup = BeautifulSoup(html, "html.parser")

        # Try different comment selectors
        comment_selectors = [
            "li.posting_element",
            '[id^="posting_"]',
            ".posting",
            ".a-comment",
        ]

        comment_elements = []
        for selector in comment_selectors:
            elements = soup.select(selector)
            if elements:
                self.logger.info(
                    f"Found {len(elements)} comments using selector: {selector}"
                )
                comment_elements = elements
                break

        if not comment_elements:
            self.logger.info("No comments found in forum HTML")
            return "", forum_url

        # Extract and format comments
        comment_html_parts = [f'<h3><a href="{forum_url}">Comments</a></h3>']
        extracted_count = 0

        for i, element in enumerate(comment_elements[:max_comments]):
            try:
                author = "Unknown"
                is_list_item = element.name == "li"

                if is_list_item:
                    # Extract from list view
                    author_elem = element.select_one(
                        ".tree_thread_list--written_by_user, .pseudonym"
                    )
                    if author_elem:
                        author = author_elem.get_text(strip=True)

                    title_link = element.select_one("a.posting_subject")
                    if not title_link:
                        continue

                    title = title_link.get_text(strip=True)
                    content = f"<p>{html_module.escape(title)}</p>"
                    comment_url = title_link.get("href", "")
                else:
                    # Extract from full posting view
                    author_selectors = [
                        'a[href*="/forum/heise-online/Meinungen"]',
                        ".pseudonym",
                        ".username",
                        "strong",
                    ]
                    for selector in author_selectors:
                        author_elem = element.select_one(selector)
                        if author_elem:
                            author_text = author_elem.get_text(strip=True)
                            if author_text and len(author_text) < 50:
                                author = author_text
                                break

                    # Extract content
                    content = ""
                    content_selectors = [
                        ".text",
                        ".posting-content",
                        ".comment-body",
                        "p",
                    ]
                    for selector in content_selectors:
                        content_elem = element.select_one(selector)
                        if content_elem:
                            content = str(content_elem)
                            break

                    comment_id = element.get("id") or f"comment-{i}"
                    comment_url = f"{article_url}#{comment_id}"

                if not content or not content.strip():
                    continue

                # Format comment
                comment_html = f"""<blockquote>
<p><strong>{html_module.escape(author)}</strong> | <a href="{comment_url}">source</a></p>
<div>{content}</div>
</blockquote>
"""
                comment_html_parts.append(comment_html)
                extracted_count += 1

            except Exception as e:
                self.logger.warning(f"Error extracting comment {i}: {e}")
                continue

        if extracted_count == 0:
            return "", forum_url

        self.logger.info(
            f"Successfully extracted {extracted_count} comments from article"
        )
        return "\n".join(comment_html_parts), forum_url

    def _extract_forum_url(self, article_html: str, article_url: str) -> str | None:
        """Extract the forum URL from article HTML."""
        soup = BeautifulSoup(article_html, "html.parser")

        # Look for JSON-LD script tag
        for script in soup.find_all("script", type="application/ld+json"):
            with contextlib.suppress(json.JSONDecodeError, KeyError):
                data = json.loads(script.string)
                # Handle both single object and array
                if isinstance(data, list):
                    for item in data:
                        if "discussionUrl" in item:
                            discussion_url = item["discussionUrl"]
                            if discussion_url.startswith("/"):
                                parsed = urlparse(article_url)
                                return (
                                    f"{parsed.scheme}://{parsed.netloc}{discussion_url}"
                                )
                            return discussion_url
                elif "discussionUrl" in data:
                    discussion_url = data["discussionUrl"]
                    if discussion_url.startswith("/"):
                        parsed = urlparse(article_url)
                        return f"{parsed.scheme}://{parsed.netloc}{discussion_url}"
                    return discussion_url

        # Fallback: look for comment links in HTML
        comment_link = soup.find("a", href=re.compile(r"/forum/.*comment"))
        if comment_link and comment_link.get("href"):
            href = comment_link["href"]
            if href.startswith("/"):
                parsed = urlparse(article_url)
                return f"{parsed.scheme}://{parsed.netloc}{href}"
            return href

        return None


def aggregate(feed, force_refresh=False, options=None):
    aggregator = HeiseAggregator()
    return aggregator.aggregate(feed, force_refresh, options or {})
