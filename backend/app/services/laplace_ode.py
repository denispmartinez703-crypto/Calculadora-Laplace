from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any

import sympy as sp
from sympy.integrals.transforms import InverseLaplaceTransform

from app.services.laplace_direct import (
    ALLOWED_GLOBALS,
    LaplaceInputError,
    ResolutionStepData,
    TRANSFORMATIONS,
    compute_expression_transform,
    parse_symbolic_expression,
    s,
    t,
)


y = sp.Function("y")
Y = sp.Symbol("Y")


@dataclass(frozen=True)
class OdeLaplaceSolution:
    equation_latex: str
    solution_latex: str
    steps: list[ResolutionStepData]


ALLOWED_ODE_LOCALS: dict[str, Any] = {
    "t": t,
    "y": y,
    "Derivative": sp.Derivative,
    "pi": sp.pi,
    "E": sp.E,
    "sin": sp.sin,
    "cos": sp.cos,
    "sinh": sp.sinh,
    "cosh": sp.cosh,
    "exp": sp.exp,
}


def solve_ode_laplace(
    raw_equation: str,
    initial_conditions: dict[str, str | int | float],
) -> OdeLaplaceSolution:
    ode_expr = parse_ode_equation(raw_equation)
    derivative_orders = sorted(find_derivative_orders(ode_expr))
    max_order = max(derivative_orders, default=0)
    initials = parse_initial_conditions(initial_conditions, max_order)

    transformed_expr, derivative_steps = transform_ode_expression(ode_expr, initials)
    y_solution = solve_for_frequency_solution(transformed_expr)

    try:
        time_solution = sp.inverse_laplace_transform(y_solution, s, t)
    except Exception as exc:
        raise LaplaceInputError(f"No se pudo aplicar la transformada inversa a Y(s): {exc}") from exc

    if time_solution.has(InverseLaplaceTransform):
        raise LaplaceInputError("No se pudo regresar la solucion al dominio t.")

    steps = build_ode_steps(ode_expr, initials, derivative_steps, transformed_expr, y_solution, time_solution)
    return OdeLaplaceSolution(
        equation_latex=sp.latex(sp.Eq(ode_expr, 0)),
        solution_latex=sp.latex(sp.Eq(y(t), sp.simplify(time_solution))),
        steps=steps,
    )


def normalize_ode_notation(raw_equation: str) -> str:
    normalized = raw_equation.strip()
    normalized = normalized.replace("y''", "Derivative(y(t), t, 2)")
    normalized = normalized.replace("y'", "Derivative(y(t), t)")
    normalized = re.sub(r"(?<![A-Za-z_])y(?![A-Za-z_\(])", "y(t)", normalized)
    return normalized


def parse_ode_equation(raw_equation: str) -> sp.Expr:
    normalized = normalize_ode_notation(raw_equation)
    if "=" in normalized:
        lhs, rhs = normalized.split("=", 1)
        expression = "(" + lhs + ")-(" + rhs + ")"
    else:
        expression = normalized

    expr = parse_symbolic_expression(expression, ALLOWED_ODE_LOCALS)
    if expr.free_symbols - {t}:
        raise LaplaceInputError("La EDO solo puede depender de t y de y(t).")
    return sp.expand(expr)


def find_derivative_orders(expr: sp.Expr) -> set[int]:
    orders = {0} if expr.has(y(t)) else set()
    for derivative in expr.atoms(sp.Derivative):
        if derivative.expr != y(t):
            continue
        orders.add(derivative_order(derivative))
    return orders


def derivative_order(derivative: sp.Derivative) -> int:
    return sum(count for variable, count in derivative.variable_count if variable == t)


def parse_initial_conditions(
    initial_conditions: dict[str, str | int | float],
    max_order: int,
) -> dict[int, sp.Expr]:
    parsed: dict[int, sp.Expr] = {}
    for order in range(max_order):
        value = find_initial_value(initial_conditions, order)
        if value is None:
            raise LaplaceInputError(
                "Para resolver una EDO por Laplace se requieren condiciones iniciales. "
                + required_initial_message(max_order)
            )
        parsed[order] = sp.sympify(value)
    return parsed


def find_initial_value(initial_conditions: dict[str, str | int | float], order: int) -> str | int | float | None:
    aliases = {
        0: ("y(0)", "y0"),
        1: ("y'(0)", "dy0", "y1"),
        2: ("y''(0)", "ddy0", "y2"),
    }
    for alias in aliases.get(order, ()):
        if alias in initial_conditions:
            return initial_conditions[alias]
    return None


def required_initial_message(max_order: int) -> str:
    required = ["y(0)"]
    if max_order >= 2:
        required.append("y'(0)")
    if max_order >= 3:
        required.append("y''(0)")
    return "Faltan: " + ", ".join(required) + "."


def transform_ode_expression(
    ode_expr: sp.Expr,
    initials: dict[int, sp.Expr],
) -> tuple[sp.Expr, list[ResolutionStepData]]:
    transformed_terms: list[sp.Expr] = []
    derivative_steps: list[ResolutionStepData] = []

    for term in sp.Add.make_args(sp.expand(ode_expr)):
        transformed_term, step = transform_ode_term(term, initials)
        transformed_terms.append(transformed_term)
        if step is not None:
            derivative_steps.append(step)

    return sp.simplify(sp.Add(*transformed_terms)), derivative_steps


def transform_ode_term(
    term: sp.Expr,
    initials: dict[int, sp.Expr],
) -> tuple[sp.Expr, ResolutionStepData | None]:
    dependent_factor = find_dependent_factor(term)
    if dependent_factor is None:
        return compute_expression_transform(term), None

    coefficient = sp.simplify(term / dependent_factor)
    if coefficient.has(t):
        raise LaplaceInputError("La EDO implementada admite coeficientes constantes.")

    if dependent_factor == y(t):
        return coefficient * Y, ResolutionStepData(
            explanation="Aplicando L{y(t)} = Y(s).",
            equation=r"\mathcal{L}\{y(t)\}=Y(s)",
        )

    order = derivative_order(dependent_factor)
    derivative_transform = s**order * Y
    for k in range(order):
        derivative_transform -= (s ** (order - 1 - k)) * initials[k]

    step = ResolutionStepData(
        explanation="Aplicando la formula de Laplace para derivadas con condiciones iniciales.",
        equation=(
            r"\mathcal{L}\{"
            + sp.latex(dependent_factor)
            + r"\}="
            + sp.latex(derivative_transform)
        ),
    )
    return coefficient * derivative_transform, step


def find_dependent_factor(term: sp.Expr) -> sp.Expr | None:
    for factor in sp.Mul.make_args(term):
        if factor == y(t):
            return factor
        if isinstance(factor, sp.Derivative) and factor.expr == y(t):
            return factor
    if term == y(t):
        return term
    if isinstance(term, sp.Derivative) and term.expr == y(t):
        return term
    return None


def solve_for_frequency_solution(transformed_expr: sp.Expr) -> sp.Expr:
    solutions = sp.solve(sp.Eq(transformed_expr, 0), Y)
    if not solutions:
        raise LaplaceInputError("No se pudo despejar Y(s) en la ecuacion transformada.")
    return sp.simplify(solutions[0])


def build_ode_steps(
    ode_expr: sp.Expr,
    initials: dict[int, sp.Expr],
    derivative_steps: list[ResolutionStepData],
    transformed_expr: sp.Expr,
    y_solution: sp.Expr,
    time_solution: sp.Expr,
) -> list[ResolutionStepData]:
    initial_latex = ", ".join(
        ("y" + "'" * order + "(0)=" + sp.latex(value)) for order, value in initials.items()
    )
    steps = [
        ResolutionStepData(
            explanation="Se plantea el problema de valor inicial.",
            equation=sp.latex(sp.Eq(ode_expr, 0)) + (r",\quad " + initial_latex if initial_latex else ""),
        ),
        ResolutionStepData(
            explanation="Se aplica la transformada de Laplace a ambos lados de la EDO.",
            equation=r"\mathcal{L}\{\text{lado izquierdo}\}=\mathcal{L}\{\text{lado derecho}\}",
        ),
    ]
    steps.extend(derivative_steps)
    steps.append(
        ResolutionStepData(
            explanation="Agrupando terminos en el dominio s.",
            equation=sp.latex(sp.Eq(transformed_expr, 0)),
        )
    )
    steps.append(
        ResolutionStepData(
            explanation="Despejando Y(s).",
            equation="Y(s)=" + sp.latex(y_solution),
        )
    )
    steps.append(
        ResolutionStepData(
            explanation="Aplicando transformada inversa para regresar al dominio t.",
            equation=sp.latex(sp.Eq(y(t), sp.simplify(time_solution))),
        )
    )
    return steps
