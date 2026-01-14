import pytest

from core.aggregators.mein_mmo.aggregator import MeinMmoAggregator


@pytest.mark.django_db
class TestMeinMmoAggregator:
    @pytest.fixture
    def mein_mmo_agg(self, rss_feed):
        rss_feed.aggregator = "mein_mmo"
        rss_feed.identifier = "https://mein-mmo.de/feed/"
        return MeinMmoAggregator(rss_feed)

    def test_extract_content_removes_affiliate_widget(self, mein_mmo_agg):
        html = """
<div class="gp-entry-content">
<p>Some content</p>
<div class="wp-block-wbd-affiliate-widget swiper js-ga-view"><div class="products swiper-wrapper">
<a class="wp-block-wbd-affiliate-widget-product product swiper-slide js-ga" href="https://ndirect.ppro.de/click/pBy1" rel="noopener nofollow sponsored" target="_blank"><div class="image"><img alt="HBO Max mit WaipuTV" decoding="async" src="https://images-toolbox.webediagaming.de/wp-content/uploads/2026/01/hbo-max-waipu.jpg"/></div><div class="name">HBO Max mit WaipuTV</div><div class="descript">HBO MAX mit über 300 HD-Sendern und mehr als 40.000 zusätzlich abrufbaren Inhalten.</div><div class="prices"><span class="price">Ab 17,99 €</span></div><button class="button">zu Waipu</button></a>
<a class="wp-block-wbd-affiliate-widget-product product swiper-slide js-ga" href="https://www.awin1.com/cread.php?awinmid=16040&amp;awinaffid=699701&amp;clickref=gam&amp;ued=https%3A%2F%2Fwww.hbomax.com%2Fde%2Fde%2Fbundle%2Frtl-plus" rel="noopener nofollow sponsored" target="_blank"><div class="image"><img alt="HBO Max mit RTL+" decoding="async" src="https://images-toolbox.webediagaming.de/wp-content/uploads/2026/01/hbo-max-rtl.jpg"/></div><div class="name">HBO Max mit RTL+</div><div class="descript">HBO MAX inklusive RTL Plus Premium und Downloads – im ersten Monat spart ihr extra!</div><div class="prices"><span class="price">Ab 9,99€ €</span></div><button class="button">zu RTL+</button></a>
<a class="wp-block-wbd-affiliate-widget-product product swiper-slide js-ga" href="https://www.hbomax.com/de/de" rel="noopener nofollow sponsored" target="_blank"><div class="image"><img alt="HBO Max" decoding="async" src="https://images-toolbox.webediagaming.de/wp-content/uploads/2026/01/hbo-max.jpg"/></div><div class="name">HBO Max</div><div class="descript">Drei Abomodelle mit und ohne Werbung und optional mit Sport-Paket, von Full-HD bis 4K.</div><div class="prices"><span class="price">Ab 5,99 €</span></div><button class="button">zu HBO Max</button></a>
</div><nav class="swiper-scrollbar"></nav></div>
<p>More content</p>
</div>
        """
        extracted = mein_mmo_agg.extract_content(html, {"name": "Test", "identifier": "test-url"})

        # Verify normal content is preserved
        assert "<p>Some content</p>" in extracted
        assert "<p>More content</p>" in extracted

        # Verify affiliate widget is removed
        assert "wp-block-wbd-affiliate-widget" not in extracted
        assert "HBO Max" not in extracted
