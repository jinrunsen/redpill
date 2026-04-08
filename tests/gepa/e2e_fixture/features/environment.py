"""Behave environment setup for e2e smoke test."""

import os

BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:5555")


def before_all(context):
    context.base_url = BASE_URL


def before_scenario(context, scenario):
    context.response = None
