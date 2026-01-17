"""Shared fixtures for handler tests."""

import pytest

from .mocks import MockLoopRunner, MockRegistry, MockRunner


@pytest.fixture
def mock_registry() -> MockRegistry:
    """Fixture for MockRegistry."""
    return MockRegistry()


@pytest.fixture
def mock_runner() -> MockRunner:
    """Fixture for MockRunner."""
    return MockRunner()


@pytest.fixture
def mock_loop_runner() -> MockLoopRunner:
    """Fixture for MockLoopRunner."""
    return MockLoopRunner()
