"""Aggregator for Mein-MMO RSS feeds."""

import re

from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from .base import BaseAggregator, RawArticle, fetch_article_content
from .base.exceptions import ContentFetchError


class MeinMmoAggregatorConfig(BaseModel):
    id: str
    type: str = Field(pattern="^(managed|custom|social)$")
    name: str = Field(min_length=1)
    url: str = ""
    description: str = Field(min_length=1)
    wait_for_selector: str | None = None
    selectors_to_remove: list[str] = Field(default_factory=list)
    options: dict = Field(default_factory=dict)


class MeinMmoAggregator(BaseAggregator):
    """Aggregator for Mein-MMO.de (German gaming news)."""

    id = "mein_mmo"
    type = "managed"
    name = "Mein-MMO"
    url = "https://mein-mmo.de/feed/"
    description = "Specialized aggregator for Mein-MMO.de (German gaming news). Extracts article content, removes ads and tracking, and standardizes embeds (YouTube, Twitter/X, Reddit) to simple image+link format."
    options = {
        "traverse_multipage": {
            "type": "boolean",
            "label": "Traverse multi-page articles",
            "help_text": "Fetch and combine all pages of multi-page articles into a single article",
            "default": False,
        },
    }

    wait_for_selector = "div.gp-entry-content"
    selectors_to_remove = [
        "div.wp-block-mmo-video",
        "div.wp-block-mmo-recirculation-box",
        "div.reading-position-indicator-end",
        "label.toggle",
        "a.wp-block-mmo-content-box",
        "ul.page-numbers",
        ".post-page-numbers",
        "#ftwp-container-outer",
        "script",
        "style",
        "iframe",
        "noscript",
    ]

    def __init__(self):
        super().__init__()
        MeinMmoAggregatorConfig(
            id=self.id,
            type=self.type,
            name=self.name,
            url=self.url,
            description=self.description,
            wait_for_selector=self.wait_for_selector,
            selectors_to_remove=self.selectors_to_remove,
            options=self.options,
        )

    def fetch_article_html(self, article: RawArticle) -> str:
        """Fetch HTML, optionally traversing multiple pages."""
        traverse_multipage = self.get_option("traverse_multipage", False)

        if traverse_multipage:
            return self._fetch_all_pages(article.url)
        else:
            return super().fetch_article_html(article)

    def _fetch_all_pages(self, base_url: str) -> str:
        """Fetch all pages of a multi-page article and combine the content."""
        self.logger.info(f"Fetching multi-page article: {base_url}")

        # Fetch first page
        first_page_html = fetch_article_content(
            base_url,
            use_cache=not self.force_refresh,
            wait_for_selector=self.wait_for_selector,
        )

        # Extract page numbers from pagination
        page_numbers = self._extract_page_numbers(first_page_html)

        if len(page_numbers) <= 1:
            self.logger.info("Single page article detected")
            return first_page_html

        max_page = max(page_numbers)
        self.logger.info(f"Multi-page article detected: {max_page} pages")

        # Extract content from first page
        soup = BeautifulSoup(first_page_html, "html.parser")
        content_div = soup.find("div", class_="gp-entry-content")

        if not content_div:
            self.logger.warning("Could not find content div on first page")
            return first_page_html

        # Collect all content parts
        all_content_parts = [str(content_div)]

        # Fetch remaining pages
        base_url_clean = base_url.rstrip("/")
        for page_num in range(2, max_page + 1):
            page_url = f"{base_url_clean}/{page_num}/"
            self.logger.info(f"Fetching page {page_num}/{max_page}: {page_url}")

            try:
                page_html = fetch_article_content(
                    page_url,
                    use_cache=not self.force_refresh,
                    wait_for_selector=self.wait_for_selector,
                )

                page_soup = BeautifulSoup(page_html, "html.parser")
                page_content = page_soup.find("div", class_="gp-entry-content")

                if page_content:
                    all_content_parts.append(str(page_content))
                    self.logger.info(f"Page {page_num} fetched successfully")
                else:
                    self.logger.warning(
                        f"Could not find content div on page {page_num}"
                    )

            except ContentFetchError as e:
                self.logger.warning(f"Failed to fetch page {page_num}: {e}")
                # Continue with other pages even if one fails (partial content is acceptable)
            except Exception as e:
                self.logger.error(f"Unexpected error fetching page {page_num}: {e}")
                # Continue with other pages even if one fails

        # Combine all content
        combined_content = "\n\n".join(all_content_parts)
        self.logger.info(
            f"Combined {len(all_content_parts)} pages into {len(combined_content)} chars"
        )

        return combined_content

    def _extract_page_numbers(self, html: str) -> set[int]:
        """Extract all page numbers from pagination in the HTML."""
        soup = BeautifulSoup(html, "html.parser")
        page_numbers = {1}  # Always include page 1

        # Look for pagination container (WordPress standard)
        pagination = soup.find("nav", class_="navigation pagination")
        if not pagination:
            # Fallback: look for ul.page-numbers
            pagination = soup.find("ul", class_="page-numbers")
        if not pagination:
            # Fallback: search in entire document
            pagination = soup

        # Look for page number links
        # WordPress typically uses a.page-numbers or a.post-page-numbers
        page_links = pagination.find_all(
            "a", class_=["page-numbers", "post-page-numbers"]
        )
        for link in page_links:
            # Try to get page number from link text
            text = link.get_text(strip=True)
            if text.isdigit():
                page_numbers.add(int(text))
                self.logger.debug(f"Found page number from link text: {text}")

            # Also try to extract from URL
            href = link.get("href", "")
            if href:
                # Try pattern: /article-name/2/ or /article-name/2
                match = re.search(r"/(\d+)/?$", href)
                if match:
                    page_numbers.add(int(match.group(1)))
                    self.logger.debug(
                        f"Found page number from URL: {match.group(1)} ({href})"
                    )

        # Also check for span.page-numbers (current page indicator)
        page_spans = pagination.find_all("span", class_=["page-numbers", "current"])
        for span in page_spans:
            text = span.get_text(strip=True)
            if text.isdigit():
                page_numbers.add(int(text))
                self.logger.debug(f"Found current page number from span: {text}")

        self.logger.info(f"Extracted page numbers: {sorted(page_numbers)}")
        return page_numbers

    def get_header_image_url(self, article: RawArticle) -> str | None:
        """Extract header image with width="16" and height="9"."""
        soup = BeautifulSoup(article.html, "html.parser")

        # First, look for image with width="16" and height="9"
        header_img = soup.find("img", attrs={"width": "16", "height": "9"})
        if header_img and header_img.get("src"):
            header_url = header_img.get("src")
            self.logger.info(f"Found header image (16x9): {header_url}")
            return header_url

        # Fallback: Look for the header div
        header_div = soup.find("div", id="gp-page-header-inner")
        if header_div:
            # Look for the img tag inside the header
            header_img = header_div.find("img")
            if header_img and header_img.get("src"):
                header_url = header_img.get("src")
                self.logger.info(f"Found header image: {header_url}")
                return header_url

        return None  # Fall back to automatic detection

    def extract_content(self, article: RawArticle) -> None:
        """Extract and clean article content from a Mein-MMO page."""
        soup = BeautifulSoup(article.html, "html.parser")

        # Handle multi-page articles: find ALL content divs, not just the first one
        content_divs = soup.find_all("div", class_="gp-entry-content")
        if not content_divs:
            self.logger.warning("Could not find article content")
            return  # Keep full HTML

        # If multi-page, we'll have multiple divs - wrap them in a container
        if len(content_divs) > 1:
            self.logger.info(
                f"Processing multi-page article with {len(content_divs)} pages"
            )
            # Create a wrapper div to contain all pages
            content = soup.new_tag("div", attrs={"class": "gp-entry-content"})
            for div in content_divs:
                # Move all children from each page div into the wrapper
                for child in list(div.children):
                    content.append(child)
        else:
            content = content_divs[0]

        # Convert embed consent placeholders to direct links
        for figure in content.find_all("figure"):
            # Check if this is a YouTube embed placeholder
            youtube_link = None
            for link in figure.find_all("a", href=True):
                href = link["href"]
                if "youtube.com" in href or "youtu.be" in href:
                    youtube_link = href
                    break

            # Check if this is a Twitter/X embed placeholder
            twitter_link = None
            if not youtube_link:
                for link in figure.find_all("a", href=True):
                    href = link["href"]
                    if "twitter.com" in href or "x.com" in href:
                        twitter_link = href
                        break

            if youtube_link:
                # Extract YouTube URL (clean up tracking parameters)
                if "?" in youtube_link and "youtube.com/watch" not in youtube_link:
                    clean_url = youtube_link.split("?")[0]
                else:
                    clean_url = youtube_link

                # Replace figure with simple link
                # The standardize_content_format() will extract thumbnail and format it
                new_p = soup.new_tag("p")
                new_link = soup.new_tag(
                    "a", href=clean_url, target="_blank", rel="noopener"
                )
                new_link.string = "Watch on YouTube"
                new_p.append(new_link)

                figure.replace_with(new_p)
                self.logger.debug(f"Converted YouTube embed to link: {clean_url}")

            elif twitter_link:
                # Extract tweet URL (clean up tracking parameters)
                if "?" in twitter_link:
                    clean_url = twitter_link.split("?")[0]
                else:
                    clean_url = twitter_link

                # Get caption text if available
                figcaption = figure.find("figcaption")
                caption_text = figcaption.get_text(strip=True) if figcaption else ""

                # Replace figure with clean link
                new_p = soup.new_tag("p")
                new_link = soup.new_tag(
                    "a", href=clean_url, target="_blank", rel="noopener"
                )
                new_link.string = f"View on X/Twitter: {clean_url}"
                new_p.append(new_link)

                if caption_text:
                    new_p.append(soup.new_tag("br"))
                    caption_span = soup.new_tag("em")
                    caption_span.string = caption_text
                    new_p.append(caption_span)

                figure.replace_with(new_p)

        # Standardize Reddit embeds (separate loop as they have different structure)
        for figure in content.find_all("figure"):
            # Check if this is a Reddit embed by looking for provider-reddit class
            sanitized_class = figure.get("data-sanitized-class", "")
            if (
                "provider-reddit" in sanitized_class
                or "embed-reddit" in sanitized_class
            ):
                # Extract Reddit URL from the embed
                reddit_link = None
                for link in figure.find_all("a", href=True):
                    href = link["href"]
                    if "reddit.com" in href:
                        reddit_link = href
                        break

                if reddit_link:
                    # Clean up tracking parameters
                    if "?" in reddit_link:
                        clean_url = reddit_link.split("?")[0]
                    else:
                        clean_url = reddit_link

                    # Replace figure with simple link
                    # The standardize_content_format() will extract thumbnail and format it
                    new_p = soup.new_tag("p")
                    new_link = soup.new_tag(
                        "a", href=clean_url, target="_blank", rel="noopener"
                    )
                    new_link.string = "View on Reddit"
                    new_p.append(new_link)

                    figure.replace_with(new_p)
                    self.logger.debug(f"Converted Reddit embed to link: {clean_url}")

        # Remove empty elements
        for tag in content.find_all(["p", "div"]):
            if not tag.get_text(strip=True) and not tag.find("img"):
                tag.decompose()

        # Clean data attributes
        for tag in content.find_all(True):
            attrs_to_remove = [
                attr
                for attr in tag.attrs
                if attr.startswith("data-") and attr not in ["data-src", "data-srcset"]
            ]
            for attr in attrs_to_remove:
                del tag[attr]

        article.html = str(content)


def aggregate(feed, force_refresh=False, options=None):
    aggregator = MeinMmoAggregator()
    return aggregator.aggregate(feed, force_refresh, options or {})
