from __future__ import annotations

import re
from typing import Any

import sympy as sp
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sympy.integrals.transforms import LaplaceTransform
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)


t = sp.Symbol("t", real=True, nonnegative=True)
s = sp.Symbol("s", real=True)


class DirectLaplaceRequest(BaseModel):
    function: str = Field(
        min_length=1,
        max_length=300,
        examples=["exp(-2*t)*sin(3*t) + t**2"],
    )


class ResolutionStep(BaseModel):
    explanation: str
    equation: str


class DirectLaplaceResponse(BaseModel):
    input_latex: str
    transform_latex: str
    convergence_latex: str | None = None
    steps: list[ResolutionStep]


router = APIRouter()


TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)

ALLOWED_GLOBALS: dict[str, Any] = {
    "__builtins__": {},
    "Integer": sp.Integer,
    "Float": sp.Float,
    "Rational": sp.Rational,
    "Symbol": sp.Symbol,
}

ALLOWED_LOCALS: dict[str, Any] = {
    "t": t,
    "pi": sp.pi,
    "E": sp.E,
    "I": sp.I,
    "sin": sp.sin,
    "cos": sp.cos,
    "sinh": sp.sinh,
    "cosh": sp.cosh,
    "exp": sp.exp,
    "sqrt": sp.sqrt,
    "log": sp.log,
    "Abs": sp.Abs,
    "Heaviside": sp.Heaviside,
    "Piecewise": sp.Piecewise,
    "True": True,
    "False": False,
}

ALLOWED_FUNCTIONS = {
    sp.sin,
    sp.cos,
    sp.sinh,
    sp.cosh,
    sp.exp,
    sp.log,
    sp.Abs,
    sp.Heaviside,
    sp.Piecewise,
}

UNSUPPORTED_OBJECTS = (
    sp.Derivative,
    sp.Integral,
    sp.Limit,
    sp.Sum,
    sp.Product,
    sp.DiracDelta,
    sp.SingularityFunction,
)


def parse_time_function(raw_function: str) -> sp.Expr:
    raw_function = raw_function.strip()
    if re.search(r"(__|import|eval|exec|open|lambda|os\.|sys\.)", raw_function):
        raise HTTPException(status_code=422, detail="La expresion contiene tokens no permitidos.")

    try:
        expr = parse_expr(
            raw_function,
            local_dict=ALLOWED_LOCALS,
            global_dict=ALLOWED_GLOBALS,
            transformations=TRANSFORMATIONS,
            evaluate=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"No se pudo interpretar f(t): {exc}") from exc

    if not isinstance(expr, sp.Expr):
        raise HTTPException(status_code=422, detail="La entrada debe ser una expresion simbolica.")

    if expr.free_symbols - {t}:
        raise HTTPException(status_code=422, detail="La funcion directa solo puede depender de t.")

    if expr.has(*UNSUPPORTED_OBJECTS):
        raise HTTPException(
            status_code=422,
            detail="Solo se admiten funciones ordinarias, continuas a trozos, para t >= 0.",
        )

    for function_atom in expr.atoms(sp.Function):
        if function_atom.func not in ALLOWED_FUNCTIONS:
            raise HTTPException(
                status_code=422,
                detail=f"Funcion no admitida: {function_atom.func.__name__}.",
            )

    return sp.simplify(expr)


def iter_piecewise_branches(expr: sp.Expr) -> list[sp.Expr]:
    branches: list[sp.Expr] = []
    for piecewise in expr.atoms(sp.Piecewise):
        branches.extend(branch_expr for branch_expr, _ in piecewise.args)
    if not branches:
        branches.append(expr)
    return branches


def assert_piecewise_continuous_candidate(expr: sp.Expr) -> None:
    for branch_expr in iter_piecewise_branches(expr):
        denominator = sp.denom(sp.together(branch_expr))
        if denominator != 1:
            roots = sp.solveset(denominator, t, domain=sp.Interval(0, sp.oo))
            if roots not in (sp.EmptySet, sp.S.EmptySet):
                raise HTTPException(
                    status_code=422,
                    detail="La funcion presenta singularidades en t >= 0; no es continua a trozos valida.",
                )

        try:
            initial_limit = sp.limit(branch_expr, t, 0, dir="+")
        except Exception:
            initial_limit = None

        if initial_limit in (sp.oo, -sp.oo, sp.zoo) or (
            initial_limit is not None and getattr(initial_limit, "has", lambda *_: False)(sp.oo, -sp.oo, sp.zoo)
        ):
            raise HTTPException(
                status_code=422,
                detail="La funcion debe tener limite lateral finito en t = 0.",
            )


def compute_validated_transform(expr: sp.Expr) -> tuple[sp.Expr, sp.Expr, sp.Expr]:
    try:
        transform, convergence_plane, condition = sp.laplace_transform(expr, t, s, noconds=False)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"SymPy no pudo calcular la transformada: {exc}") from exc

    if transform.has(LaplaceTransform):
        raise HTTPException(
            status_code=422,
            detail="No se pudo demostrar simbolicamente que la funcion sea de orden exponencial.",
        )

    if condition is sp.false or convergence_plane in (sp.oo, sp.zoo):
        raise HTTPException(
            status_code=422,
            detail="La funcion no cumple una region de convergencia valida para la transformada de Laplace.",
        )

    return sp.simplify(transform), convergence_plane, condition


def detect_exponential_shift(term: sp.Expr) -> tuple[sp.Expr, sp.Expr] | None:
    for function_atom in term.atoms(sp.Function):
        if function_atom.func != sp.exp:
            continue

        exponent = sp.expand(function_atom.args[0])
        shift = sp.simplify(sp.diff(exponent, t))
        if shift.has(t):
            continue

        if sp.simplify(exponent - shift * t) == 0:
            return shift, sp.simplify(term / function_atom)

    return None


def detect_t_power(term: sp.Expr) -> tuple[int, sp.Expr] | None:
    powers = term.as_powers_dict()
    exponent = powers.get(t)

    if exponent is None or not exponent.is_integer or int(exponent) <= 0:
        return None

    n = int(exponent)
    return n, sp.simplify(term / (t**n))


def latex_of_laplace(expr: sp.Expr) -> str:
    return r"\mathcal{L}\left\{" + sp.latex(expr) + r"\right\}"


def latex_laplace_body(body: str) -> str:
    return r"\mathcal{L}\left\{" + body + r"\right\}"


def build_steps(expr: sp.Expr, final_transform: sp.Expr, convergence_plane: sp.Expr) -> list[ResolutionStep]:
    steps: list[ResolutionStep] = [
        ResolutionStep(
            explanation="Se valida que la entrada depende de t, es continua a trozos para t >= 0 y es de orden exponencial.",
            equation=rf"f(t)={sp.latex(expr)}",
        )
    ]

    expanded_expr = sp.expand(expr, mul=True)
    terms = list(sp.Add.make_args(expanded_expr))

    if len(terms) > 1:
        separated = "+".join(latex_of_laplace(term) for term in terms)
        steps.append(
            ResolutionStep(
                explanation="Aplicando la propiedad de Linealidad, la transformada de una suma es la suma de las transformadas.",
                equation=rf"{latex_of_laplace(expanded_expr)}={separated}",
            )
        )

    term_transforms: list[sp.Expr] = []
    for term in terms:
        shift = detect_exponential_shift(term)
        power = detect_t_power(term)

        if shift is not None:
            a, base = shift
            base_transform = sp.laplace_transform(base, t, s, noconds=True)
            shifted_transform = sp.simplify(base_transform.subs(s, s - a))
            steps.append(
                ResolutionStep(
                    explanation="Aplicando el Primer Teorema de Traslacion, un factor exponencial desplaza la variable s.",
                    equation=(
                        latex_laplace_body(rf"e^{{{sp.latex(a * t)}}}{sp.latex(base)}")
                        + "="
                        rf"{sp.latex(base_transform.subs(s, s - a))}="
                        rf"{sp.latex(shifted_transform)}"
                    ),
                )
            )

        if power is not None:
            n, base = power
            base_transform = sp.laplace_transform(base, t, s, noconds=True)
            differentiated = sp.simplify((-1) ** n * sp.diff(base_transform, s, n))
            steps.append(
                ResolutionStep(
                    explanation="Aplicando el teorema de la derivada en s, la multiplicacion por t^n se convierte en derivacion respecto de s.",
                    equation=(
                        latex_laplace_body(rf"t^{{{n}}}{sp.latex(base)}")
                        + "="
                        rf"(-1)^{{{n}}}\frac{{d^{{{n}}}}}{{ds^{{{n}}}}}"
                        rf"\left({sp.latex(base_transform)}\right)="
                        rf"{sp.latex(differentiated)}"
                    ),
                )
            )

        term_transform = sp.simplify(sp.laplace_transform(term, t, s, noconds=True))
        term_transforms.append(term_transform)
        steps.append(
            ResolutionStep(
                explanation="Evaluando la transformada del termino con la tabla basica de transformadas de Laplace.",
                equation=rf"{latex_of_laplace(term)}={sp.latex(term_transform)}",
            )
        )

    combined_transform = sp.Add(*term_transforms)
    simplified_transform = sp.simplify(combined_transform)
    if len(term_transforms) > 1 or simplified_transform != combined_transform:
        steps.append(
            ResolutionStep(
                explanation="Simplificando algebraicamente la suma obtenida despues de aplicar las propiedades anteriores.",
                equation=rf"{sp.latex(combined_transform)}={sp.latex(simplified_transform)}",
            )
        )

    steps.append(
        ResolutionStep(
            explanation="Resultado final de la transformada directa de Laplace.",
            equation=(
                latex_of_laplace(expr)
                + "="
                + sp.latex(final_transform)
                + r",\quad \operatorname{Re}(s)>"
                + sp.latex(convergence_plane)
            ),
        )
    )

    return steps


@router.post("/laplace/direct", response_model=DirectLaplaceResponse)
def direct_laplace(payload: DirectLaplaceRequest) -> DirectLaplaceResponse:
    expr = parse_time_function(payload.function)
    assert_piecewise_continuous_candidate(expr)
    transform, convergence_plane, condition = compute_validated_transform(expr)

    return DirectLaplaceResponse(
        input_latex=sp.latex(expr),
        transform_latex=sp.latex(transform),
        convergence_latex=sp.latex(condition) if condition is not sp.true else None,
        steps=build_steps(expr, transform, convergence_plane),
    )


app = FastAPI(title="Calculadora y Tutor de Transformadas de Laplace")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["POST"],
    allow_headers=["*"],
)
app.include_router(router)
