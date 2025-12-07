# Templates Directory

This directory contains Django templates, including the Angular SPA entry point.

## Angular Integration

The `index.html` file in this directory is the entry point for the Angular single-page application (SPA).

**Important:** This file must be copied from the Angular build output during deployment:

```bash
# After building Angular
cd frontend
ng build --configuration production

# Copy index.html to Django templates
cp dist/browser/index.html ../templates/
```

## How It Works

1. **Angular Build**: Creates `frontend/dist/browser/` with index.html, CSS, and JS files
2. **Copy index.html**: Copied to `templates/` directory
3. **Static Files**: CSS/JS files collected by Django's `collectstatic` command
4. **URL Routing**: Django's catch-all URL pattern serves `index.html` for all non-API routes
5. **Client-Side Routing**: Angular handles all routing within the SPA

## Production Deployment

```bash
# 1. Build Angular app
cd frontend && ng build --configuration production

# 2. Copy index.html to templates
cp dist/browser/index.html ../templates/

# 3. Collect static files
python manage.py collectstatic --noinput

# 4. Run server
gunicorn yana.wsgi:application
```

## Cache Strategy

- **Static Files (CSS/JS)**: Cached indefinitely (Angular uses hashed filenames)
- **index.html**: Never cached (ensures users always get latest script references)
