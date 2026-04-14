"""
WSGI entrypoint for MetaDoc production deployments.

Use this module with a production server such as Gunicorn:
    gunicorn wsgi:app
"""

from app import create_app

app = create_app()
