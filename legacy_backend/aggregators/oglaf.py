"""Aggregator for Oglaf comics (https://www.oglaf.com/).

Oglaf has an age confirmation page that requires clicking a "confirm" button
before showing the actual comic content.
"""

import contextlib

from bs4 import BeautifulSoup
from playwright.sync_api import Page
from pydantic import BaseModel, Field

from .base import BaseAggregator, RawArticle, _get_browser, _return_browser
from .base.exceptions import ContentFetchError


class OglafAggregatorConfig(BaseModel):
    id: str
    type: str = Field(pattern="^(managed|custom|social)$")
    name: str = Field(min_length=1)
    url: str = ""
    description: str = Field(min_length=1)
    wait_for_selector: str | None = None
    selectors_to_remove: list[str] = Field(default_factory=list)
    options: dict = Field(default_factory=dict)


class OglafAggregator(BaseAggregator):
    """
    Oglaf webcomic aggregator.

    Adult webcomic featuring fantasy, humor, and occasional NSFW content.
    Handles the age confirmation page automatically.
    """

    id = "oglaf"
    type = "managed"
    name = "Oglaf"
    url = "https://www.oglaf.com/feeds/rss/"
    description = "Oglaf is an adult webcomic featuring fantasy, humor, and occasional NSFW content. This aggregator handles the age confirmation page automatically."

    def __init__(self):
        super().__init__()
        OglafAggregatorConfig(
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
        """
        Fetch Oglaf comic content, handling the age confirmation page.

        Oglaf requires clicking an age confirmation button before showing content.
        """
        self.logger.info(f"Fetching Oglaf content from {article.url}")

        browser = None
        try:
            browser = _get_browser()
            page: Page = browser.new_page()
            page.set_default_timeout(self.fetch_timeout)

            # Navigate to URL
            page.goto(article.url, wait_until="networkidle")

            # Check if we're on a confirmation page and click the confirm button
            try:
                confirm_button = page.wait_for_selector("#confirm", timeout=5000)
                if confirm_button:
                    self.logger.debug(
                        "Found confirmation page, clicking confirm button"
                    )
                    confirm_button.click()
                    page.wait_for_load_state("networkidle")
            except Exception as e:
                # No confirm button or already confirmed
                self.logger.debug(
                    f"No age confirmation needed or already confirmed: {e}"
                )

            # Get the page content
            content = page.content()
            page.close()

            return content

        except Exception as e:
            self.logger.error(
                f"Error fetching Oglaf content from {article.url}: {e}", exc_info=True
            )
            raise ContentFetchError(
                f"Failed to fetch Oglaf content from {article.url}: {e}"
            ) from e

        finally:
            if browser:
                with contextlib.suppress(Exception):
                    _return_browser(browser)

    def extract_content(self, article: RawArticle) -> None:
        """Extract the comic image from Oglaf page HTML."""
        try:
            soup = BeautifulSoup(article.html, "html.parser")
            comic_img = soup.find("img", id="strip")
            if not comic_img:
                comic_img = soup.select_one(".content img, #content img, .comic img")
            if comic_img:
                img_src = comic_img.get("src", "")
                alt_text = comic_img.get("alt", "Oglaf comic")
                article.html = f'<img src="{img_src}" alt="{alt_text}">'
                return
            self.logger.warning(f"Could not find comic image in {article.url}")
            article.html = f'<p>Could not extract comic. <a href="{article.url}">View on Oglaf</a></p>'
        except Exception as e:
            self.logger.error(
                f"Extraction failed for {article.url}: {e}", exc_info=True
            )


def aggregate(feed, force_refresh=False, options=None):
    aggregator = OglafAggregator()
    return aggregator.aggregate(feed, force_refresh, options or {})
