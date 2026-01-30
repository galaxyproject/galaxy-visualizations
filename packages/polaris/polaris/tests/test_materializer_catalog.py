"""Tests for the materializer catalog."""

import pytest

from polaris.modules.materializers.catalog import MaterializerCatalog


class TestMaterializerCatalog:
    """Tests for MaterializerCatalog."""

    def test_register_and_get(self):
        """Test registering and retrieving a materializer."""
        catalog = MaterializerCatalog()

        def my_fn(x: int) -> int:
            return x * 2

        catalog.register("test.my_fn", my_fn)
        retrieved = catalog.get("test.my_fn")

        assert retrieved is my_fn
        assert retrieved(5) == 10

    def test_register_duplicate_raises(self):
        """Test that registering a duplicate name raises."""
        catalog = MaterializerCatalog()

        def fn1():
            pass

        def fn2():
            pass

        catalog.register("test.fn", fn1)

        with pytest.raises(ValueError, match="already registered"):
            catalog.register("test.fn", fn2)

    def test_get_unknown_raises(self):
        """Test that getting an unknown materializer raises."""
        catalog = MaterializerCatalog()

        with pytest.raises(KeyError, match="Unknown materializer"):
            catalog.get("nonexistent")

    def test_freeze_prevents_registration(self):
        """Test that freeze prevents further registrations."""
        catalog = MaterializerCatalog()
        catalog.freeze()

        def fn():
            pass

        with pytest.raises(RuntimeError, match="catalog is frozen"):
            catalog.register("test.fn", fn)

    def test_is_frozen(self):
        """Test is_frozen returns correct state."""
        catalog = MaterializerCatalog()

        assert catalog.is_frozen() is False
        catalog.freeze()
        assert catalog.is_frozen() is True

    def test_list_all(self):
        """Test list_all returns sorted names."""
        catalog = MaterializerCatalog()

        catalog.register("z.last", lambda: None)
        catalog.register("a.first", lambda: None)
        catalog.register("m.middle", lambda: None)

        names = catalog.list_all()

        assert names == ["a.first", "m.middle", "z.last"]

    def test_clear_resets_catalog(self):
        """Test clear resets the catalog for testing."""
        catalog = MaterializerCatalog()

        catalog.register("test.fn", lambda: None)
        catalog.freeze()

        catalog.clear()

        assert catalog.is_frozen() is False
        assert catalog.list_all() == []

    def test_get_after_freeze_works(self):
        """Test that get still works after freeze."""
        catalog = MaterializerCatalog()

        def fn():
            return "result"

        catalog.register("test.fn", fn)
        catalog.freeze()

        retrieved = catalog.get("test.fn")
        assert retrieved() == "result"


class TestModuleLevelFunctions:
    """Tests for module-level convenience functions."""

    def test_register_decorator(self):
        """Test the register decorator."""
        from polaris.modules.materializers.catalog import _get_catalog, register

        catalog = _get_catalog()
        catalog.clear()

        @register("test.decorated_fn")
        def decorated_fn(x: int) -> int:
            return x + 1

        assert "test.decorated_fn" in catalog.list_all()
        assert catalog.get("test.decorated_fn")(10) == 11

        catalog.clear()

    def test_get_function(self):
        """Test the module-level get function."""
        from polaris.modules.materializers.catalog import _get_catalog, get, register

        catalog = _get_catalog()
        catalog.clear()

        @register("test.get_test")
        def fn():
            return "hello"

        retrieved = get("test.get_test")
        assert retrieved() == "hello"

        catalog.clear()

    def test_freeze_and_is_frozen(self):
        """Test module-level freeze and is_frozen."""
        from polaris.modules.materializers.catalog import (
            _get_catalog,
            freeze,
            is_frozen,
        )

        catalog = _get_catalog()
        catalog.clear()

        assert is_frozen() is False
        freeze()
        assert is_frozen() is True

        catalog.clear()

    def test_list_all_function(self):
        """Test module-level list_all."""
        from polaris.modules.materializers.catalog import (
            _get_catalog,
            list_all,
            register,
        )

        catalog = _get_catalog()
        catalog.clear()

        @register("b.second")
        def fn1():
            pass

        @register("a.first")
        def fn2():
            pass

        assert list_all() == ["a.first", "b.second"]

        catalog.clear()
