"""run_python reports what the code did, including when it failed partway.

Execution is async, so submitted code may use top-level `await` and reach the network
through the browser's own fetch. The reach is the page's: CORS decides, not us.
"""

import asyncio

import pytest

from olit.substrate.local import LocalExecutionError, LocalPython


class Manifest:
    def require(self, capability):
        pass


def local():
    return LocalPython(Manifest())


def run(runner, code):
    return asyncio.run(runner.run(code))


# --- Ordinary synchronous Python is unchanged ---------------------------------


def test_success_without_output_says_so():
    assert run(local(), "x = 1") == "(no output)"


def test_success_returns_the_last_expression():
    assert run(local(), "x = 1\nx + 1") == "2"


def test_success_returns_stdout_and_the_last_expression():
    assert run(local(), "print('hi')\n41 + 1") == "hi\n42"


def test_state_persists_across_calls():
    runner = local()
    run(runner, "import math\nradius = 2")
    assert run(runner, "round(math.pi * radius ** 2, 2)") == "12.57"


# --- Top-level await ----------------------------------------------------------


def test_top_level_await_returns_the_awaited_value():
    code = "import asyncio\nawait asyncio.sleep(0)\n'awaited'"
    assert run(local(), code) == "'awaited'"


def test_an_awaited_expression_is_the_result():
    code = "async def double(n):\n" "    return n * 2\n" "await double(21)"
    assert run(local(), code) == "42"


def test_await_can_be_used_in_the_middle_of_a_program():
    code = (
        "import asyncio\n"
        "async def fetch(n):\n"
        "    await asyncio.sleep(0)\n"
        "    return n\n"
        "total = 0\n"
        "for i in range(3):\n"
        "    total += await fetch(i)\n"
        "print('summed')\n"
        "total"
    )
    assert run(local(), code) == "summed\n3"


# --- The browser's fetch ------------------------------------------------------


class FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status = status

    async def string(self):
        return self._payload


def test_pyfetch_is_in_the_namespace_without_an_import(monkeypatch):
    """Seeded at construction, so reaching an API is one line for the model."""
    calls = []

    async def fake_pyfetch(url, **kwargs):
        calls.append(url)
        return FakeResponse("run_accession\nSRR390728\n")

    monkeypatch.setattr("olit.substrate.local.pyfetch", fake_pyfetch)
    runner = local()

    code = (
        "r = await pyfetch('https://www.ebi.ac.uk/ena/portal/api/filereport?accession=SRR390728')\n"
        "text = await r.string()\n"
        "text.splitlines()[1]"
    )
    assert run(runner, code) == "'SRR390728'"
    assert calls == ["https://www.ebi.ac.uk/ena/portal/api/filereport?accession=SRR390728"]


def test_without_pyodide_the_name_is_simply_absent(monkeypatch):
    """CPython has no browser; the failure is an ordinary NameError, not a crash."""
    monkeypatch.setattr("olit.substrate.local.pyfetch", None)

    with pytest.raises(LocalExecutionError) as caught:
        run(local(), "await pyfetch('https://example.invalid')")
    assert "NameError" in str(caught.value)


def test_a_fetch_that_raises_surfaces_like_any_other_failure(monkeypatch):
    """A CORS refusal arrives as an exception from the browser, not as a status."""

    async def refusing(url, **kwargs):
        raise OSError("Failed to fetch")

    monkeypatch.setattr("olit.substrate.local.pyfetch", refusing)

    with pytest.raises(LocalExecutionError) as caught:
        run(local(), "print('before')\nawait pyfetch('https://no-cors.invalid')")
    text = str(caught.value)
    assert text.startswith("before")
    assert "Failed to fetch" in text


# --- Failures still surface through the same path -----------------------------


def test_failure_keeps_what_was_printed_before_it():
    with pytest.raises(LocalExecutionError) as caught:
        run(local(), "print('loaded 3 rows')\n1 / 0")
    text = str(caught.value)
    assert text.startswith("loaded 3 rows")
    assert "ZeroDivisionError: division by zero" in text


def test_failure_points_at_the_line_in_the_submitted_code():
    with pytest.raises(LocalExecutionError) as caught:
        run(local(), "a = 1\nb = 2\nmissing_name\n")
    text = str(caught.value)
    assert 'File "<olit>", line 3' in text
    assert "local.py" not in text


def test_a_failure_inside_an_awaited_call_still_points_at_the_code():
    code = "async def boom():\n" "    raise ValueError('no rows')\n" "await boom()"
    with pytest.raises(LocalExecutionError) as caught:
        run(local(), code)
    text = str(caught.value)
    assert "ValueError: no rows" in text
    assert "local.py" not in text


def test_a_syntax_error_is_reported_like_any_other_failure():
    with pytest.raises(LocalExecutionError) as caught:
        run(local(), "def (:")
    assert "SyntaxError" in str(caught.value)


def test_state_survives_a_failure():
    runner = local()
    with pytest.raises(LocalExecutionError):
        run(runner, "kept = 7\n1 / 0")
    assert run(runner, "kept") == "7"


def test_a_refused_capability_is_not_an_execution_error():
    class Denied:
        def require(self, capability):
            raise PermissionError("local is not granted")

    with pytest.raises(PermissionError):
        asyncio.run(LocalPython(Denied()).run("1 + 1"))
