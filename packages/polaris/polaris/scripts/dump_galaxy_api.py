#!/usr/bin/env python3
"""Dump Galaxy API endpoints from OpenAPI spec for inspection.

Usage:
    python scripts/dump_galaxy_api.py https://usegalaxy.org/

This will create a file 'galaxy_endpoints.txt' with all available endpoints.
"""

import asyncio
import sys

# Add parent to path for imports
sys.path.insert(0, ".")

from polaris.core.client import http
from polaris.modules.api.openapi import OpenApiCatalog


async def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/dump_galaxy_api.py <galaxy_url>")
        print("Example: python scripts/dump_galaxy_api.py https://usegalaxy.org/")
        sys.exit(1)

    galaxy_url = sys.argv[1].rstrip("/") + "/"
    output_file = "galaxy_endpoints.txt"

    print(f"Fetching OpenAPI spec from {galaxy_url}openapi.json ...")

    try:
        spec = await http.request("GET", f"{galaxy_url}openapi.json")
    except Exception as e:
        print(f"Error fetching OpenAPI spec: {e}")
        sys.exit(1)

    # Dump ALL endpoints (no prefix filter)
    all_prefixes = ["/api/"]
    catalog = OpenApiCatalog(
        spec=spec,
        prefixes=all_prefixes,
        methods=["get"],
        dump_path=output_file,
    )

    print(f"\nFound {len(catalog.index)} GET endpoints")
    print(f"Written to: {output_file}")

    # Also print a summary by category
    categories = {}
    for name in catalog.index.keys():
        category = name.split(".")[0]
        categories[category] = categories.get(category, 0) + 1

    print("\nEndpoints by category:")
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")


if __name__ == "__main__":
    asyncio.run(main())
