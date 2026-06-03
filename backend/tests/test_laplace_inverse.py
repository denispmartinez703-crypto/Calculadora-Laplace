from __future__ import annotations

from app.services.laplace_inverse import solve_inverse_laplace


def test_inverse_laplace_basic_shift() -> None:
    solution = solve_inverse_laplace("1/(s+2)")

    assert solution.result_latex == r"e^{- 2 t}"
    assert any("transformadas inversas" in step.explanation for step in solution.steps)


def test_inverse_laplace_partial_fractions() -> None:
    solution = solve_inverse_laplace("(s + 3)/(s**2 + 3*s + 2)")

    assert solution.result_latex
    assert any("fracciones parciales" in step.explanation for step in solution.steps)
