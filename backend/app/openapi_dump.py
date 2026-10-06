"""Prints the OpenAPI schema (used to generate frontend types): python -m app.openapi_dump > openapi.json"""

import json
import sys

from app.main import create_app

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(create_app().openapi(), indent=1, ensure_ascii=False))
