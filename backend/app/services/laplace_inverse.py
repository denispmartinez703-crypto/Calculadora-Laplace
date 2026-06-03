from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import sympy as sp
from sympy.integrals.transforms import InverseLaplaceTransform

from app.services.laplace_direct import (
    ALLOWED_GLOBALS,
    LaplaceInputError,
    ResolutionStepData,
    TRANSFORMATIONS,
    parse_symbolic_expression,
    s,
    t,
)


@dataclass(frozen=True)
class InverseLaplaceSolution:
    input_latex: str
    result_latex: str
    steps: list[ResolutionStepData]


ALLOWED_FREQUENCY_LOCALS: dict[str, Any] = {
    "s": s,
    "pi": sp.pi,
    "E": sp.E,
    "I": sp.I,
    "sqrt": sp.sqrt,
}


def solve_inverse_laplace(raw_expression: str) -> InverseLaplaceSolution:
    expr = parse_frequency_function(raw_expression)
    partial_fraction = sp.apart(expr, s)

    try:
        inverse = sp.inverse_laplace_transform(expr, s, t)
    except Exception as exc:
        raise LaplaceInputError(f"SymPy no pudo calcular la transformada inversa: {exc}") from exc

    if inverse.has(InverseLaplaceTransform):
        raise LaplaceInputError(
            "No se pudo calcular la transformada inversa. Intenta una funcion racional en s."
        )

    steps = build_inverse_steps(expr, partial_fraction, sp.simplify(inverse))
    return InverseLaplaceSolution(
        input_latex=sp.latex(expr),
        result_latex=sp.latex(sp.simplify(inverse)),
        steps=steps,
    )


def parse_frequency_function(raw_expression: str) -> sp.Expr:
    expr = parse_symbolic_expression(raw_expression, ALLOWED_FREQUENCY_LOCALS)
    if expr.free_symbols - {s}:
        raise LaplaceInputError("La transformada inversa solo puede depender de s.")
    return sp.simplify(expr)


def build_inverse_steps(
    expr: sp.Expr,
    partial_fraction: sp.Expr,
    inverse: sp.Expr,
) -> list[ResolutionStepData]:
    steps = [
        ResolutionStepData(
            explanation="Se identifica la funcion F(s) en el dominio de frecuencia.",
            equation="F(s)=" + sp.latex(expr),
        )
    ]

    if partial_fraction != expr:
        steps.append(
            ResolutionStepData(
                explanation=(
                    "Aplicando descomposicion en fracciones parciales para separar "
                    "terminos que coincidan con la tabla inversa."
                ),
                equation=sp.latex(expr) + "=" + sp.latex(partial_fraction),
            )
        )

    terms = list(sp.Add.make_args(partial_fraction))
    for term in terms:
        term_inverse = sp.inverse_laplace_transform(term, s, t)
        steps.append(
            ResolutionStepData(
                explanation="Aplicando la tabla de transformadas inversas termino a termino.",
                equation=(
                    r"\mathcal{L}^{-1}\left\{"
                    + sp.latex(term)
                    + r"\right\}="
                    + sp.latex(sp.simplify(term_inverse))
                ),
            )
        )

    steps.append(
        ResolutionStepData(
            explanation="Resultado final en el dominio del tiempo t.",
            equation="f(t)=" + sp.latex(inverse),
        )
    )

    return steps

