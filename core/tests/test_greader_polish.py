import datetime

from django.contrib.auth.models import User
from django.utils import timezone

import pytest

from core.models import Article, Feed
from core.services.greader.stream_service import _compute_unread_count


@pytest.mark.django_db
class TestGReaderPolish:
    """Test GReader API refinements and optimizations."""

    @pytest.fixture
    def user(self):
        return User.objects.create_user(username="polish_user", password="password")

    @pytest.fixture
    def test_data(self, user):
        # Create 2 feeds
        f1 = Feed.objects.create(name="Feed 1", aggregator="rss", identifier="url1", user=user)
        f2 = Feed.objects.create(name="Feed 2", aggregator="rss", identifier="url2", user=user)

        now = timezone.now()

        # Feed 1: 3 articles, 2 unread, newest is a1
        a1 = Article.objects.create(
            feed=f1, name="A1", identifier="i1", content="C", read=False, date=now
        )
        a2 = Article.objects.create(
            feed=f1,
            name="A2",
            identifier="i2",
            content="C",
            read=False,
            date=now - datetime.timedelta(hours=1),
        )
        a3 = Article.objects.create(
            feed=f1,
            name="A3",
            identifier="i3",
            content="C",
            read=True,
            date=now - datetime.timedelta(hours=2),
        )

        # Feed 2: 1 article, read
        a4 = Article.objects.create(
            feed=f2,
            name="A4",
            identifier="i4",
            content="C",
            read=True,
            date=now - datetime.timedelta(hours=3),
        )

        return {"user": user, "feeds": [f1, f2], "articles": [a1, a2, a3, a4], "now": now}

    def test_compute_unread_count_optimized(self, test_data):
        """Verify that _compute_unread_count returns correct results after optimization."""
        user = test_data["user"]
        f1 = test_data["feeds"][0]

        # Test include_all=False
        result = _compute_unread_count(user.id, include_all=False)
        assert len(result["unreadcounts"]) == 1
        assert result["unreadcounts"][0]["id"] == f"feed/{f1.id}"
        assert result["unreadcounts"][0]["count"] == 2

        # Test include_all=True
        result = _compute_unread_count(user.id, include_all=True)
        assert len(result["unreadcounts"]) == 2

        counts = {c["id"]: c["count"] for c in result["unreadcounts"]}
        assert counts[f"feed/{test_data['feeds'][0].id}"] == 2
        assert counts[f"feed/{test_data['feeds'][1].id}"] == 0
