"""
Management command to set up Django-Q2 scheduled aggregation.
"""

from django.conf import settings
from django.core.management.base import BaseCommand
from django_q.models import Schedule


class Command(BaseCommand):
    help = "Set up the scheduled aggregation task using Django-Q2"

    def add_arguments(self, parser):
        parser.add_argument(
            "--delete",
            action="store_true",
            help="Delete existing aggregation schedules",
        )

    def handle(self, *args, **options):
        schedule_name = "aggregate_all_feeds"

        if options["delete"]:
            deleted, _ = Schedule.objects.filter(
                name__in=[
                    schedule_name,
                    "delete_old_articles",
                    "clean_django_q_history",
                ]
            ).delete()
            self.stdout.write(
                self.style.SUCCESS(f"Deleted {deleted} existing schedule(s)")
            )
            return

        # Get cron schedule from settings
        cron_schedule = settings.AGGREGATION_SCHEDULE

        # Parse cron format: minute hour day month day_of_week
        cron_parts = cron_schedule.split()
        if len(cron_parts) != 5:
            self.stderr.write(
                self.style.ERROR(
                    f"Invalid cron format: {cron_schedule}. "
                    "Expected 5 parts: minute hour day month day_of_week"
                )
            )
            return

        minute, hour, day, month, day_of_week = cron_parts

        # Create or update the aggregation schedule
        schedule, created = Schedule.objects.update_or_create(
            name=schedule_name,
            defaults={
                "func": "core.tasks.aggregate_all_feeds",
                "schedule_type": Schedule.CRON,
                "cron": cron_schedule,
                "repeats": -1,  # Run indefinitely
            },
        )

        if created:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Created schedule '{schedule_name}' with cron: {cron_schedule}"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Updated schedule '{schedule_name}' with cron: {cron_schedule}"
                )
            )

        # Create or update the cleanup schedule (runs daily at 01:00)
        cleanup_schedule_name = "delete_old_articles"
        cleanup_cron = "0 1 * * *"  # Daily at 01:00

        cleanup_schedule, cleanup_created = Schedule.objects.update_or_create(
            name=cleanup_schedule_name,
            defaults={
                "func": "core.tasks.delete_old_articles",
                "schedule_type": Schedule.CRON,
                "cron": cleanup_cron,
                "repeats": -1,  # Run indefinitely
            },
        )

        if cleanup_created:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Created schedule '{cleanup_schedule_name}' with cron: {cleanup_cron}"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Updated schedule '{cleanup_schedule_name}' with cron: {cleanup_cron}"
                )
            )

        # Create or update the Django-Q history cleanup schedule (runs daily at 02:00)
        djangoq_cleanup_schedule_name = "clean_django_q_history"
        djangoq_cleanup_cron = "0 2 * * *"  # Daily at 02:00

        djangoq_cleanup_schedule, djangoq_cleanup_created = (
            Schedule.objects.update_or_create(
                name=djangoq_cleanup_schedule_name,
                defaults={
                    "func": "core.tasks.clean_django_q_history",
                    "schedule_type": Schedule.CRON,
                    "cron": djangoq_cleanup_cron,
                    "repeats": -1,  # Run indefinitely
                },
            )
        )

        if djangoq_cleanup_created:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Created schedule '{djangoq_cleanup_schedule_name}' with cron: {djangoq_cleanup_cron}"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Updated schedule '{djangoq_cleanup_schedule_name}' with cron: {djangoq_cleanup_cron}"
                )
            )

        self.stdout.write(
            self.style.NOTICE(
                "Remember to run 'python manage.py qcluster' to start processing tasks"
            )
        )
