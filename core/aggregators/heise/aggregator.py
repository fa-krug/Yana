"""Heise aggregator implementation."""

import json
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from ..utils import fetch_html
from ..website import FullWebsiteAggregator


class HeiseAggregator(FullWebsiteAggregator):
    """Specialized aggregator for Heise.de German tech news."""

    HEISE_URL = "https://www.heise.de/"

    def __init__(self, feed):
        super().__init__(feed)
        if not self.identifier or self.identifier == "":
            self.identifier = "https://www.heise.de/rss/heise.rdf"

    def get_source_url(self) -> str:
        """Return the Heise website URL for GReader API."""
        return self.HEISE_URL

    @classmethod
    def get_identifier_choices(cls) -> List[Tuple[str, str]]:
        """Get available Heise RSS feed choices."""
        return [
            ("https://www.heise.de/rss/heise.rdf", "Main Feed"),
            ("https://www.heise.de/rss/heise-security.rdf", "Security"),
            ("https://www.heise.de/rss/heise-developer.rdf", "Developer"),
            ("https://www.heise.de/rss/heise-top.rdf", "Top News"),
        ]

    @classmethod
    def get_default_identifier(cls) -> str:
        """Get default Heise identifier."""
        return "https://www.heise.de/rss/heise.rdf"

    # Heise specific selectors
    content_selector = "#meldung, .StoryContent"

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

    def fetch_article_content(self, url: str) -> str:
        """Fetch article content, optionally converting to all-pages URL."""
        # By default, we always try to get all pages if it's a multi-page article
        article_url = url
        try:
            parsed = urlparse(url)
            if "seite=all" not in parsed.query:
                article_url = f"{url}&seite=all" if parsed.query else f"{url}?seite=all"
                self.logger.info(
                    f"[fetch_article_content] Converted to all-pages URL: {article_url}"
                )
        except Exception as e:
            self.logger.warning(f"[fetch_article_content] Failed to convert to all-pages URL: {e}")

        return super().fetch_article_content(article_url)

    def filter_articles(self, articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filter articles based on title terms."""
        # First use base filtering (age check)
        articles = super().filter_articles(articles)

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

        filtered = []
        for article in articles:
            title = article.get("name", "")
            if any(term in title for term in skip_terms):
                self.logger.info(f"[filter_articles] Skipping filtered content by title: {title}")
                continue
            filtered.append(article)

        return filtered

    def enrich_articles(self, articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Enrich articles and filter out specific content terms."""
        enriched = super().enrich_articles(articles)

        # Additional content-based filtering (e.g. Event Sourcing)
        final_articles = []
        for article in enriched:
            content = article.get("content", "").lower()
            if "event sourcing" in content:
                self.logger.info(
                    f"[enrich_articles] Skipping article with 'Event Sourcing' in content: {article['name']}"
                )
                continue
            final_articles.append(article)

        return final_articles

    def extract_content(self, html: str, article: Dict[str, Any]) -> str:
        """Extract Heise specific content and remove empty elements."""
        extracted = super().extract_content(html, article)

        # Process content - remove empty elements (similar to cheerio logic in TS)
        soup = BeautifulSoup(extracted, "html.parser")
        for tag in soup.find_all(["p", "div", "span"]):
            # Remove if it has no text and no images
            if not tag.get_text(strip=True) and not tag.find_all("img"):
                tag.decompose()

        return str(soup)

    def process_content(self, html: str, article: Dict[str, Any]) -> str:
        """Process content and optionally add comments."""
        # Use base process_content for initial cleaning and formatting
        # Note: Base FullWebsiteAggregator.process_content calls format_article_content
        processed = super().process_content(html, article)

        # Extract and append comments if possible (Requested "all features")
        try:
            # We need the original full HTML to find the forum link
            raw_html = article.get("raw_content", "")
            if raw_html:
                comments_html = self.extract_comments(article["identifier"], raw_html)
                if comments_html:
                    processed += f"\n\n{comments_html}"
        except Exception as e:
            self.logger.warning(
                f"[process_content] Failed to extract comments for {article['identifier']}: {e}"
            )

        return processed

    def extract_comments(
        self, article_url: str, article_html: str, max_comments: int = 5
    ) -> Optional[str]:
        """Extract comments from the forum link."""
        forum_url = self._find_forum_url(article_html, article_url)
        if not forum_url:
            return None

        self.logger.info(f"[extract_comments] Fetching comments from forum: {forum_url}")
        try:
            forum_html = fetch_html(forum_url)
            soup = BeautifulSoup(forum_html, "html.parser")

            # Find comment elements
            comment_elements = self._find_comment_elements(soup)
            if not comment_elements:
                return None

            comment_parts = []
            for i, el in enumerate(comment_elements[:max_comments]):
                comment_html = self._process_comment_element(el, i, article_url)
                if comment_html:
                    comment_parts.append(comment_html)

            if not comment_parts:
                return None

            header = f'<h3><a href="{forum_url}">Comments</a></h3>'
            return f'<section style="margin-top: 2em; border-top: 1px solid #eee; padding-top: 1em;">{header}{"".join(comment_parts)}</section>'

        except Exception as e:
            self.logger.warning(f"[extract_comments] Error: {e}")
            return None

    def _find_forum_url(self, html: str, article_url: str) -> Optional[str]:
        """Find forum URL from JSON-LD or fallback links."""
        soup = BeautifulSoup(html, "html.parser")

        # JSON-LD
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
                items = data if isinstance(data, list) else [data]
                for item in items:
                    if "discussionUrl" in item:
                        return urljoin(article_url, item["discussionUrl"])
            except Exception:
                continue

        # Fallback link
        comment_link = soup.select_one('a[href*="/forum/"][href*="comment"]')
        if comment_link and comment_link.get("href"):
            return urljoin(article_url, comment_link["href"])

        return None

    def _find_comment_elements(self, soup: BeautifulSoup) -> List[Any]:
        """Find comment elements using various selectors."""
        selectors = [
            "li.posting_element",
            '[id^="posting_"]',
            ".posting",
            ".a-comment",
        ]
        for selector in selectors:
            elements = soup.select(selector)
            if elements:
                return elements
        return []

    def _process_comment_element(self, el: Any, index: int, article_url: str) -> Optional[str]:
        """Process a single comment element."""
        # Determine if it's a list item view or full view
        if el.name == "li":
            return self._process_list_item_comment(el)
        else:
            return self._process_full_view_comment(el, index, article_url)

    def _process_list_item_comment(self, el: Any) -> Optional[str]:
        author = "Unknown"
        author_el = el.select_one(".tree_thread_list--written_by_user, .pseudonym")
        if author_el:
            author = author_el.get_text(strip=True)

        title_link = el.select_one("a.posting_subject")
        if not title_link:
            return None

        title = title_link.get_text(strip=True)
        comment_url = urljoin(self.HEISE_URL, title_link.get("href", ""))

        return (
            f'<blockquote style="margin: 1em 0; padding: 0.5em 1em; border-left: 4px solid #ddd; background: #f9f9f9;">'
            f'<p><strong>{author}</strong> | <a href="{comment_url}">source</a></p>'
            f"<div><p>{title}</p></div>"
            f"</blockquote>"
        )

    def _process_full_view_comment(self, el: Any, index: int, article_url: str) -> Optional[str]:
        author = "Unknown"
        author_selectors = [
            'a[href*="/forum/heise-online/Meinungen"]',
            ".pseudonym",
            ".username",
            "strong",
        ]
        for selector in author_selectors:
            author_el = el.select_one(selector)
            if author_el:
                text = author_el.get_text(strip=True)
                if text and len(text) < 50:
                    author = text
                    break

        content = ""
        content_selectors = [".text", ".posting-content", ".comment-body", "p"]
        for selector in content_selectors:
            content_el = el.select_one(selector)
            if content_el:
                content = str(content_el)
                break

        if not content:
            return None

        comment_id = el.get("id") or f"comment-{index}"
        comment_url = f"{article_url}#{comment_id}"

        return (
            f'<blockquote style="margin: 1em 0; padding: 0.5em 1em; border-left: 4px solid #ddd; background: #f9f9f9;">'
            f'<p><strong>{author}</strong> | <a href="{comment_url}">source</a></p>'
            f"<div>{content}</div>"
            f"</blockquote>"
        )
