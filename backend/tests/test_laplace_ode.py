from __future__ import annotations

from app.services.laplace_direct import LaplaceInputError
from app.services.laplace_ode import solve_ode_laplace


def test_ode_second_order_initial_value_problem() -> None:
    solution = solve_ode_laplace(
        "Derivative(y(t), t, 2) + 3*Derivative(y(t), t) + 2*y(t) = 0",
        {"y(0)": 1, "dy0": 0},
    )

    assert "y" in solution.solution_latex
    assert any("formula de Laplace para derivadas" in step.explanation for step in solution.steps)


def test_ode_requires_initial_conditions() -> None:
    try:
        solve_ode_laplace("y'' + 3*y' + 2*y = 0", {"y(0)": 1})
    except LaplaceInputError as exc:
        assert "condiciones iniciales" in str(exc)
    else:
        raise AssertionError("Expected missing initial condition to be rejected")
