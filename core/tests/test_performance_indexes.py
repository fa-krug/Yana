import pytest

from core.models import Article, Feed


@pytest.mark.django_db
class TestPerformanceIndexes:
    """Test that performance-critical indexes are present."""

    def test_article_composite_index_exists(self):
        """Check if the composite index (feed, read, date) exists on Article."""
        index_fields = [set(index.fields) for index in Article._meta.indexes]
        expected_fields = {"feed", "read", "date"}
        assert expected_fields in index_fields, (
            f"Composite index {expected_fields} not found in Article._meta.indexes"
        )

    def test_feed_aggregator_index_exists(self):
        """Check if the index on aggregator exists on Feed."""
        index_fields = [set(index.fields) for index in Feed._meta.indexes]
        expected_fields = {"aggregator"}
        assert expected_fields in index_fields, (
            f"Index {expected_fields} not found in Feed._meta.indexes"
        )
