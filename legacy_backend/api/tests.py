"""
Tests for the Yana API app.
"""

import logging

from django.contrib.auth.models import User
from django.test import Client, TestCase
from django.utils import timezone

from core.models import Article, Feed

from .models import GReaderAuthToken, Group, UserArticleState

logger = logging.getLogger(__name__)


class GroupModelTest(TestCase):
    """Tests for the Group model."""

    def setUp(self) -> None:
        """Set up test data."""
        self.user = User.objects.create_user(
            username="testuser", password="testpass123"
        )
        self.feed = Feed.objects.create(
            name="Test Feed",
            identifier="https://example.com/feed.xml",
            aggregator="full_website",
        )
        self.group = Group.objects.create(name="Test Group", user=self.user)

    def test_group_creation(self) -> None:
        """Test that a group can be created with valid data."""
        self.assertEqual(self.group.name, "Test Group")
        self.assertEqual(self.group.user, self.user)
        self.assertIsNotNone(self.group.created_at)
        self.assertIsNotNone(self.group.updated_at)

    def test_group_str(self) -> None:
        """Test the string representation of a group."""
        self.assertEqual(str(self.group), "Test Group")

    def test_group_repr(self) -> None:
        """Test the repr of a group."""
        self.assertEqual(repr(self.group), "<Group: Test Group>")

    def test_group_feeds_relationship(self) -> None:
        """Test the many-to-many relationship between groups and feeds."""
        self.feed.groups.add(self.group)
        self.assertEqual(self.feed.groups.count(), 1)
        self.assertEqual(self.group.feeds.count(), 1)

    def test_group_without_user(self) -> None:
        """Test that a group can be created without a user (shared group)."""
        shared_group = Group.objects.create(name="Shared Group")
        self.assertIsNone(shared_group.user)

    def test_group_unique_together(self) -> None:
        """Test that name and user must be unique together."""
        from django.db import IntegrityError

        with self.assertRaises(IntegrityError):
            Group.objects.create(name="Test Group", user=self.user)


class GReaderAuthTokenTest(TestCase):
    """Tests for the GReaderAuthToken model."""

    def setUp(self) -> None:
        """Set up test data."""
        self.user = User.objects.create_user(
            username="testuser", password="testpass123"
        )

    def test_token_creation(self) -> None:
        """Test that a token can be created."""
        token = GReaderAuthToken.create_for_user(self.user)
        self.assertIsNotNone(token)
        self.assertEqual(token.user, self.user)
        self.assertEqual(len(token.token), 64)  # SHA-256 hex

    def test_generate_token(self) -> None:
        """Test token generation."""
        token1 = GReaderAuthToken.generate_token(self.user)
        token2 = GReaderAuthToken.generate_token(self.user)
        self.assertNotEqual(token1, token2)  # Tokens should be unique

    def test_get_user_by_token(self) -> None:
        """Test getting user by token."""
        auth_token = GReaderAuthToken.create_for_user(self.user)
        user = GReaderAuthToken.get_user_by_token(auth_token.token)
        self.assertEqual(user, self.user)

    def test_get_user_by_invalid_token(self) -> None:
        """Test getting user by invalid token returns None."""
        user = GReaderAuthToken.get_user_by_token("invalid_token")
        self.assertIsNone(user)

    def test_token_expiry(self) -> None:
        """Test that expired tokens are invalid."""
        auth_token = GReaderAuthToken.create_for_user(self.user)
        auth_token.expires_at = timezone.now() - timezone.timedelta(hours=1)
        auth_token.save()

        user = GReaderAuthToken.get_user_by_token(auth_token.token)
        self.assertIsNone(user)

    def test_token_is_valid(self) -> None:
        """Test is_valid method."""
        auth_token = GReaderAuthToken.create_for_user(self.user)
        self.assertTrue(auth_token.is_valid())

        auth_token.expires_at = timezone.now() - timezone.timedelta(hours=1)
        auth_token.save()
        self.assertFalse(auth_token.is_valid())

    def test_token_str(self) -> None:
        """Test the string representation of a token."""
        auth_token = GReaderAuthToken.create_for_user(self.user)
        self.assertEqual(str(auth_token), f"Token for {self.user.username}")


class UserArticleStateTest(TestCase):
    """Tests for the UserArticleState model."""

    def setUp(self) -> None:
        """Set up test data."""
        self.user = User.objects.create_user(
            username="testuser", password="testpass123"
        )
        self.feed = Feed.objects.create(
            name="Test Feed",
            identifier="https://example.com/feed.xml",
            aggregator="full_website",
        )
        self.article = Article.objects.create(
            feed=self.feed,
            name="Test Article",
            url="https://example.com/article1",
            content="<p>Test content</p>",
        )

    def test_state_creation(self) -> None:
        """Test that an article state can be created."""
        state = UserArticleState.objects.create(user=self.user, article=self.article)
        self.assertEqual(state.user, self.user)
        self.assertEqual(state.article, self.article)
        self.assertFalse(state.is_read)
        self.assertFalse(state.is_saved)

    def test_state_read(self) -> None:
        """Test marking an article as read."""
        state = UserArticleState.objects.create(
            user=self.user, article=self.article, is_read=True
        )
        self.assertTrue(state.is_read)

    def test_state_saved(self) -> None:
        """Test marking an article as saved."""
        state = UserArticleState.objects.create(
            user=self.user, article=self.article, is_saved=True
        )
        self.assertTrue(state.is_saved)

    def test_state_unique_together(self) -> None:
        """Test that user and article must be unique together."""
        from django.db import IntegrityError

        UserArticleState.objects.create(user=self.user, article=self.article)
        with self.assertRaises(IntegrityError):
            UserArticleState.objects.create(user=self.user, article=self.article)

    def test_state_str(self) -> None:
        """Test the string representation of a state."""
        state = UserArticleState.objects.create(
            user=self.user, article=self.article, is_read=True, is_saved=True
        )
        self.assertIn("read", str(state))
        self.assertIn("saved", str(state))


class GReaderApiTest(TestCase):
    """Tests for the Google Reader API endpoints."""

    def setUp(self) -> None:
        """Set up test data."""
        self.client = Client()
        self.user = User.objects.create_user(
            username="testuser", password="testpass123", email="test@example.com"
        )
        self.feed = Feed.objects.create(
            name="Test Feed",
            identifier="https://example.com/feed.xml",
            aggregator="full_website",
        )
        self.article = Article.objects.create(
            feed=self.feed,
            name="Test Article",
            url="https://example.com/article1",
            content="<p>Test content</p>",
            date=timezone.now(),
        )
        self.auth_token = GReaderAuthToken.create_for_user(self.user)
        self.auth_header = f"GoogleLogin auth={self.auth_token.token}"

    def test_client_login_success(self) -> None:
        """Test successful authentication."""
        response = self.client.post(
            "/api/greader/accounts/ClientLogin",
            {"Email": "testuser", "Passwd": "testpass123"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("Auth=", response.content.decode())

    def test_client_login_failure(self) -> None:
        """Test failed authentication."""
        response = self.client.post(
            "/api/greader/accounts/ClientLogin",
            {"Email": "testuser", "Passwd": "wrongpassword"},
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn("BadAuthentication", response.content.decode())

    def test_token_endpoint(self) -> None:
        """Test the token endpoint."""
        response = self.client.get(
            "/api/greader/reader/api/0/token", HTTP_AUTHORIZATION=self.auth_header
        )
        self.assertEqual(response.status_code, 200)
        # Token should be 57 characters
        self.assertEqual(len(response.content.decode()), 57)

    def test_token_endpoint_unauthorized(self) -> None:
        """Test token endpoint without auth."""
        response = self.client.get("/api/greader/reader/api/0/token")
        self.assertEqual(response.status_code, 401)

    def test_user_info(self) -> None:
        """Test the user info endpoint."""
        response = self.client.get(
            "/api/greader/reader/api/0/user-info", HTTP_AUTHORIZATION=self.auth_header
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["userName"], "testuser")
        self.assertEqual(data["userEmail"], "test@example.com")

    def test_subscription_list(self) -> None:
        """Test the subscription list endpoint."""
        response = self.client.get(
            "/api/greader/reader/api/0/subscription/list",
            HTTP_AUTHORIZATION=self.auth_header,
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("subscriptions", data)
        self.assertEqual(len(data["subscriptions"]), 1)
        self.assertEqual(data["subscriptions"][0]["title"], "Test Feed")

    def test_tag_list(self) -> None:
        """Test the tag list endpoint."""
        response = self.client.get(
            "/api/greader/reader/api/0/tag/list", HTTP_AUTHORIZATION=self.auth_header
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("tags", data)

    def test_stream_contents(self) -> None:
        """Test the stream contents endpoint."""
        response = self.client.get(
            "/api/greader/reader/api/0/stream/contents/",
            HTTP_AUTHORIZATION=self.auth_header,
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("items", data)
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["title"], "Test Article")

    def test_stream_item_ids(self) -> None:
        """Test the stream item IDs endpoint."""
        response = self.client.get(
            "/api/greader/reader/api/0/stream/items/ids",
            HTTP_AUTHORIZATION=self.auth_header,
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("itemRefs", data)
        self.assertEqual(len(data["itemRefs"]), 1)

    def test_unread_count(self) -> None:
        """Test the unread count endpoint."""
        response = self.client.get(
            "/api/greader/reader/api/0/unread-count",
            HTTP_AUTHORIZATION=self.auth_header,
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("unreadcounts", data)
        self.assertEqual(data["max"], 1)  # One unread article

    def test_edit_tag_mark_read(self) -> None:
        """Test marking an article as read."""
        response = self.client.post(
            "/api/greader/reader/api/0/edit-tag",
            {"i": str(self.article.id), "a": "user/-/state/com.google/read"},
            HTTP_AUTHORIZATION=self.auth_header,
        )
        self.assertEqual(response.status_code, 200)

        # Verify the article is marked as read
        state = UserArticleState.objects.get(user=self.user, article=self.article)
        self.assertTrue(state.is_read)

    def test_edit_tag_mark_starred(self) -> None:
        """Test marking an article as starred."""
        response = self.client.post(
            "/api/greader/reader/api/0/edit-tag",
            {"i": str(self.article.id), "a": "user/-/state/com.google/starred"},
            HTTP_AUTHORIZATION=self.auth_header,
        )
        self.assertEqual(response.status_code, 200)

        # Verify the article is marked as starred
        state = UserArticleState.objects.get(user=self.user, article=self.article)
        self.assertTrue(state.is_saved)

    def test_edit_tag_mark_unread(self) -> None:
        """Test marking an article as unread removes state record."""
        # First mark as read
        UserArticleState.objects.create(
            user=self.user, article=self.article, is_read=True
        )
        self.assertTrue(
            UserArticleState.objects.filter(
                user=self.user, article=self.article
            ).exists()
        )

        # Mark as unread
        response = self.client.post(
            "/api/greader/reader/api/0/edit-tag",
            {"i": str(self.article.id), "r": "user/-/state/com.google/read"},
            HTTP_AUTHORIZATION=self.auth_header,
        )
        self.assertEqual(response.status_code, 200)

        # Verify the state record is deleted (unread is default, no record needed)
        self.assertFalse(
            UserArticleState.objects.filter(
                user=self.user, article=self.article, is_read=False, is_saved=False
            ).exists()
        )

    def test_stream_contents_read_state(self) -> None:
        """Test that read state is correctly reflected in stream contents."""
        # Mark article as read
        UserArticleState.objects.create(
            user=self.user, article=self.article, is_read=True
        )

        response = self.client.get(
            "/api/greader/reader/api/0/stream/contents/",
            HTTP_AUTHORIZATION=self.auth_header,
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("items", data)
        self.assertEqual(len(data["items"]), 1)

        # Verify read state is in categories
        item = data["items"][0]
        self.assertIn("categories", item)
        self.assertIn("user/-/state/com.google/read", item["categories"])

        # Verify no duplicate categories
        categories = item["categories"]
        self.assertEqual(
            len(categories),
            len(set(categories)),
            "Categories should not have duplicates",
        )

    def test_no_duplicate_state_records(self) -> None:
        """Test that duplicate state records are not created."""
        # Create initial state
        UserArticleState.objects.create(
            user=self.user, article=self.article, is_read=True
        )

        # Try to mark as read again (should update, not create duplicate)
        response = self.client.post(
            "/api/greader/reader/api/0/edit-tag",
            {"i": str(self.article.id), "a": "user/-/state/com.google/read"},
            HTTP_AUTHORIZATION=self.auth_header,
        )
        self.assertEqual(response.status_code, 200)

        # Verify only one state record exists
        states = UserArticleState.objects.filter(user=self.user, article=self.article)
        self.assertEqual(states.count(), 1, "Should only have one state record")

        # Verify it's still marked as read
        state = states.first()
        self.assertTrue(state.is_read)

    def test_bulk_operations_no_duplicates(self) -> None:
        """Test that bulk operations don't create duplicates."""
        # Create a second article
        article2 = Article.objects.create(
            feed=self.feed,
            name="Test Article 2",
            url="https://example.com/article2",
            content="<p>Test content 2</p>",
            date=timezone.now(),
        )

        # Mark both articles as read via edit-tag
        response = self.client.post(
            "/api/greader/reader/api/0/edit-tag",
            {
                "i": f"{self.article.id},{article2.id}",
                "a": "user/-/state/com.google/read",
            },
            HTTP_AUTHORIZATION=self.auth_header,
        )
        self.assertEqual(response.status_code, 200)

        # Verify exactly 2 state records exist (one per article)
        states = UserArticleState.objects.filter(
            user=self.user, article_id__in=[self.article.id, article2.id]
        )
        self.assertEqual(states.count(), 2, "Should have exactly 2 state records")

        # Verify no duplicates for each article
        article1_states = states.filter(article=self.article)
        article2_states = states.filter(article=article2)
        self.assertEqual(
            article1_states.count(), 1, "Article 1 should have exactly 1 state"
        )
        self.assertEqual(
            article2_states.count(), 1, "Article 2 should have exactly 1 state"
        )

    def test_mark_all_as_read(self) -> None:
        """Test marking all articles as read."""
        response = self.client.post(
            "/api/greader/reader/api/0/mark-all-as-read",
            {"s": f"feed/{self.feed.id}"},
            HTTP_AUTHORIZATION=self.auth_header,
        )
        self.assertEqual(response.status_code, 200)

        # Verify the article is marked as read
        state = UserArticleState.objects.get(user=self.user, article=self.article)
        self.assertTrue(state.is_read)
