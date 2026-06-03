from __future__ import annotations

from app.services.laplace_direct import LaplaceInputError, solve_direct_laplace


def test_direct_laplace_polynomial() -> None:
    solution = solve_direct_laplace("t**2")

    assert solution.transform_latex == r"\frac{2}{s^{3}}"
    assert any("derivada en s" in step.explanation for step in solution.steps)


def test_direct_laplace_rejects_frequency_variable_input() -> None:
    try:
        solve_direct_laplace("s + t")
    except LaplaceInputError as exc:
        assert "solo puede depender de t" in str(exc)
    else:
        raise AssertionError("Expected input with symbol s to be rejected")


def test_direct_laplace_rejects_non_exponential_order() -> None:
    try:
        solve_direct_laplace("exp(t**2)")
    except LaplaceInputError as exc:
        assert "no es de orden exponencial" in str(exc)
    else:
        raise AssertionError("Expected exp(t**2) to be rejected")


def test_direct_laplace_integral_property() -> None:
    solution = solve_direct_laplace("Integral(sin(tau),(tau,0,t))")

    assert solution.transform_latex == r"\frac{1}{s^{3} + s}"
    assert any("transformada de una integral" in step.explanation for step in solution.steps)


def test_direct_laplace_heaviside_shift() -> None:
    solution = solve_direct_laplace("Heaviside(t-2)*(t-2)")

    assert solution.transform_latex == r"\frac{e^{- 2 s}}{s^{2}}"
    assert any("Segundo Teorema de Traslacion" in step.explanation for step in solution.steps)
