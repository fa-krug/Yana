import pytest
from bs4 import BeautifulSoup
from django.test import override_settings

from core.aggregators.utils.youtube import proxy_youtube_embeds

@override_settings(BASE_URL="http://testserver")
def test_proxy_youtube_embeds_replaces_iframe():
    html = '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>'
    soup = BeautifulSoup(html, "html.parser")

    proxy_youtube_embeds(soup)

    div = soup.find("div", class_="youtube-embed-container")
    assert div is not None

    iframe = div.find("iframe")
    assert iframe is not None
    assert iframe["src"] == "http://testserver/api/youtube-proxy?v=dQw4w9WgXcQ"

@override_settings(BASE_URL="http://testserver")
def test_proxy_youtube_embeds_handles_youtu_be():
    html = '<iframe src="https://youtu.be/dQw4w9WgXcQ"></iframe>'
    soup = BeautifulSoup(html, "html.parser")

    proxy_youtube_embeds(soup)

    iframe = soup.find("iframe")
    assert iframe["src"] == "http://testserver/api/youtube-proxy?v=dQw4w9WgXcQ"

def test_proxy_youtube_embeds_ignores_non_youtube():
    html = '<iframe src="https://vimeo.com/123456"></iframe>'
    soup = BeautifulSoup(html, "html.parser")

    proxy_youtube_embeds(soup)

    iframe = soup.find("iframe")
    assert iframe["src"] == "https://vimeo.com/123456"
    assert soup.find("div", class_="youtube-embed-container") is None

def test_proxy_youtube_embeds_ignores_invalid_url():
    html = '<iframe src="https://www.youtube.com/invalid"></iframe>'
    soup = BeautifulSoup(html, "html.parser")

    proxy_youtube_embeds(soup)

    iframe = soup.find("iframe")
    assert iframe["src"] == "https://www.youtube.com/invalid"
    assert soup.find("div", class_="youtube-embed-container") is None

@override_settings(BASE_URL="http://testserver")
def test_proxy_youtube_embeds_multiple_iframes():
    html = """
    <div>
        <iframe src="https://www.youtube.com/embed/video1"></iframe>
        <p>Text</p>
        <iframe src="https://other.com/embed"></iframe>
        <iframe src="https://www.youtube.com/embed/video2"></iframe>
    </div>
    """
    soup = BeautifulSoup(html, "html.parser")

    proxy_youtube_embeds(soup)

    iframes = soup.find_all("iframe")
    # 2 youtube (inside divs) + 1 other = 3 iframes total
    assert len(iframes) == 3

    # Check sources
    srcs = [f["src"] for f in iframes]
    assert "http://testserver/api/youtube-proxy?v=video1" in srcs
    assert "http://testserver/api/youtube-proxy?v=video2" in srcs
    assert "https://other.com/embed" in srcs
