from datetime import timedelta

from django.contrib.auth.models import User
from django.utils import timezone

import pytest

from core.models import Article, Feed, FeedGroup
from core.services.article_service import ArticleService


@pytest.mark.django_db
class TestArticleCleanup:
    @pytest.fixture
    def user(self):
        return User.objects.create_user(username="testuser", password="password")

    @pytest.fixture
    def group(self, user):
        return FeedGroup.objects.create(name="Test Group", user=user)

    @pytest.fixture
    def feed(self, user, group):
        return Feed.objects.create(name="Test Feed", user=user, group=group)

    def test_delete_old_articles(self, feed):
        now = timezone.now()

        # Article 1: 3 months old (should be deleted)
        a1 = Article.objects.create(
            name="Old Article", identifier="id1", feed=feed, date=now - timedelta(days=91)
        )

        # Article 2: 1 month old (should be kept)
        a2 = Article.objects.create(
            name="New Article", identifier="id2", feed=feed, date=now - timedelta(days=30)
        )

        # Article 3: 3 months old BUT starred (should be kept)
        a3 = Article.objects.create(
            name="Old Starred Article",
            identifier="id3",
            feed=feed,
            date=now - timedelta(days=91),
            starred=True,
        )

        # Run cleanup
        count = ArticleService.delete_old_articles(months=2)

        # Verify results
        assert count == 1
        assert not Article.objects.filter(id=a1.id).exists()
        assert Article.objects.filter(id=a2.id).exists()
        assert Article.objects.filter(id=a3.id).exists()
