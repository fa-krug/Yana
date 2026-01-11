import json

from django.contrib.auth.models import User
from django.test import Client, TestCase

from core.models import Article, Feed


class PWATest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="password")
        self.client = Client()
        self.client.login(username="testuser", password="password")

        self.feed = Feed.objects.create(name="Test Feed", user=self.user)
        self.article1 = Article.objects.create(
            name="Article 1", identifier="http://example.com/1", content="Content 1", feed=self.feed
        )
        self.article2 = Article.objects.create(
            name="Article 2", identifier="http://example.com/2", content="Content 2", feed=self.feed
        )

    def test_pwa_index(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "core/pwa/index.html")

    def test_sync_articles(self):
        response = self.client.get("/api/pwa/sync/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("articles", data)
        self.assertEqual(len(data["articles"]), 2)

        # Check sorting (Newest first by default in model, let's check view)
        # View uses .order_by('-date')
        # Article 1 and 2 have same date (now), so order might be unstable or by ID.
        # Let's just check ids exist
        ids = sorted([a["id"] for a in data["articles"]])
        self.assertEqual(ids, sorted([self.article1.id, self.article2.id]))

        # Check content
        article_data = next(a for a in data["articles"] if a["id"] == self.article1.id)
        self.assertEqual(article_data["title"], "Article 1")
        self.assertEqual(article_data["content"], "Content 1")

    def test_mark_read(self):
        self.assertFalse(self.article1.read)
        response = self.client.post(
            "/api/pwa/read/",
            data=json.dumps({"article_id": self.article1.id}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.article1.refresh_from_db()
        self.assertTrue(self.article1.read)

    def test_mark_read_invalid(self):
        response = self.client.post(
            "/api/pwa/read/",
            data=json.dumps({"article_id": 99999}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_sync_filters_user(self):
        other_user = User.objects.create_user(username="other", password="password")
        other_feed = Feed.objects.create(name="Other Feed", user=other_user)
        Article.objects.create(name="Other Art", feed=other_feed, identifier="x", content="x")

        response = self.client.get("/api/pwa/sync/")
        data = response.json()
        self.assertEqual(len(data["articles"]), 2)  # Should only see own articles
