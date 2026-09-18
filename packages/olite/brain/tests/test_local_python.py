"""run_python reports what the code did, including when it failed partway."""

import pytest

from olite.substrate.local import LocalExecutionError, LocalPython


class Manifest:
    def require(self, capability):
        pass


def local():
    return LocalPython(Manifest())


def test_success_without_output_says_so():
    assert local().run("x = 1") == "(no output)"


def test_success_returns_the_last_expression():
    assert local().run("x = 1\nx + 1") == "2"


def test_success_returns_stdout_and_the_last_expression():
    assert local().run("print('hi')\n41 + 1") == "hi\n42"


def test_failure_keeps_what_was_printed_before_it():
    with pytest.raises(LocalExecutionError) as caught:
        local().run("print('loaded 3 rows')\n1 / 0")
    text = str(caught.value)
    assert text.startswith("loaded 3 rows")
    assert "ZeroDivisionError: division by zero" in text


def test_failure_points_at_the_line_in_the_submitted_code():
    with pytest.raises(LocalExecutionError) as caught:
        local().run("a = 1\nb = 2\nmissing_name\n")
    text = str(caught.value)
    assert 'File "<olite>", line 3' in text
    assert "local.py" not in text


def test_a_syntax_error_is_reported_like_any_other_failure():
    with pytest.raises(LocalExecutionError) as caught:
        local().run("def (:")
    assert "SyntaxError" in str(caught.value)


def test_state_survives_a_failure():
    runner = local()
    with pytest.raises(LocalExecutionError):
        runner.run("kept = 7\n1 / 0")
    assert runner.run("kept") == "7"


def test_a_refused_capability_is_not_an_execution_error():
    class Denied:
        def require(self, capability):
            raise PermissionError("local is not granted")

    with pytest.raises(PermissionError):
        LocalPython(Denied()).run("1 + 1")
