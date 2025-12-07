"""
Django management command to create default AI quotas for all users.

This command creates UserAIQuota records for all users who don't have one,
using the default limits from settings.
"""

import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import UserAIQuota

logger = logging.getLogger(__name__)

User = get_user_model()


class Command(BaseCommand):
    """
    Management command to create default AI quotas for all users.

    Usage:
        python manage.py setup_ai_quotas           # Create quotas for all users
        python manage.py setup_ai_quotas --reset   # Reset existing quotas to defaults
    """

    help = "Create default AI quotas for all users"

    def add_arguments(self, parser) -> None:
        """
        Add command-line arguments.

        Args:
            parser: The argument parser
        """
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Reset existing quotas to default limits",
        )

    def handle(self, *args, **options) -> None:
        """
        Execute the command.

        Args:
            *args: Positional arguments
            **options: Keyword arguments from argparse
        """
        reset: bool = options.get("reset", False)

        # Check if AI is enabled
        if not settings.AI_ENABLED:
            self.stdout.write(
                self.style.WARNING(
                    "AI is not enabled (OPENAI_API_KEY not configured). Skipping quota setup."
                )
            )
            return

        users = User.objects.all()
        total_users = users.count()

        if total_users == 0:
            self.stdout.write(self.style.WARNING("No users found in the system."))
            return

        self.stdout.write(
            self.style.NOTICE(f"Setting up AI quotas for {total_users} user(s)...")
        )
        self.stdout.write(
            self.style.NOTICE(
                f"Default limits: {settings.AI_DEFAULT_DAILY_LIMIT} daily, {settings.AI_DEFAULT_MONTHLY_LIMIT} monthly"
            )
        )

        created_count = 0
        updated_count = 0
        skipped_count = 0

        now = timezone.now()
        tomorrow = (now + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        next_month = (now + timedelta(days=32)).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )

        for user in users:
            quota, created = UserAIQuota.objects.get_or_create(
                user=user,
                defaults={
                    "daily_limit": settings.AI_DEFAULT_DAILY_LIMIT,
                    "monthly_limit": settings.AI_DEFAULT_MONTHLY_LIMIT,
                    "daily_reset_at": tomorrow,
                    "monthly_reset_at": next_month,
                },
            )

            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f"  ✓ Created quota for user: {user.username}")
                )
            elif reset:
                # Reset to defaults
                quota.daily_limit = settings.AI_DEFAULT_DAILY_LIMIT
                quota.monthly_limit = settings.AI_DEFAULT_MONTHLY_LIMIT
                quota.daily_used = 0
                quota.monthly_used = 0
                quota.daily_reset_at = tomorrow
                quota.monthly_reset_at = next_month
                quota.save()
                updated_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f"  ✓ Reset quota for user: {user.username}")
                )
            else:
                skipped_count += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"  - Quota already exists for user: {user.username} (use --reset to update)"
                    )
                )

        # Summary
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("Summary:"))
        self.stdout.write(self.style.SUCCESS(f"  Created: {created_count}"))
        if reset:
            self.stdout.write(self.style.SUCCESS(f"  Updated: {updated_count}"))
        self.stdout.write(self.style.WARNING(f"  Skipped: {skipped_count}"))
        self.stdout.write(self.style.SUCCESS(f"  Total users: {total_users}"))
        self.stdout.write(self.style.SUCCESS("=" * 60))

        if created_count > 0 or updated_count > 0:
            self.stdout.write(
                self.style.SUCCESS(
                    f"\n✓ Successfully configured AI quotas for {created_count + updated_count} user(s)!"
                )
            )
