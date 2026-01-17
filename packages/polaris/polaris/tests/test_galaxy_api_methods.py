"""Tests to verify Galaxy API only allows GET methods."""

import inspect

from polaris.modules.api import generic
from polaris.modules.api.api import API_METHODS
from polaris.modules.api.galaxy import ALLOWED_METHODS


class TestGalaxyApiMethods:
    """Verify Galaxy API is restricted to GET-only operations."""

    def test_get_is_allowed(self):
        """Verify GET method is in ALLOWED_METHODS."""
        assert API_METHODS.GET in ALLOWED_METHODS

    def test_post_is_not_allowed(self):
        """Verify POST method is not in ALLOWED_METHODS."""
        assert API_METHODS.POST not in ALLOWED_METHODS


class TestOpenApiGetHandler:
    """Verify the openapi_get handler only uses GET method."""

    def test_openapi_get_source_uses_get_method(self):
        """Verify openapi_get function explicitly uses GET method in source."""
        source = inspect.getsource(generic.openapi_get)

        # Verify the handler uses GET
        assert 'request("GET"' in source or "request('GET'" in source, (
            "openapi_get handler must explicitly use GET method"
        )

        # Verify POST is not used
        assert 'request("POST"' not in source and "request('POST'" not in source, (
            "openapi_get handler must not use POST method"
        )
