"""
ASGI config for yana project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "aggregato.settings")

# Allow synchronous ORM operations in async context
# This is needed because Playwright creates async contexts and Django's ORM is synchronous
os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"

application = get_asgi_application()
