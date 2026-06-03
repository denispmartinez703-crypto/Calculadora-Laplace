from __future__ import annotations

from dataclasses import dataclass
import math
import re
from typing import Any

import sympy as sp
from sympy.integrals.transforms import LaplaceTransform
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)


t = sp.Symbol("t", real=True, positive=True)
s = sp.Symbol("s", real=True)
tau = sp.Symbol("tau", real=True, nonnegative=True)


class LaplaceInputError(ValueError):
    """Raised when the user input violates the Laplace tutor rules."""


@dataclass(frozen=True)
class ResolutionStepData:
    explanation: str
    equation: str


@dataclass(frozen=True)
class DirectLaplaceSolution:
    input_latex: str
    transform_latex: str
    convergence_latex: str | None
    steps: list[ResolutionStepData]


@dataclass(frozen=True)
class TableMatch:
    name: str
    formula_latex: str
    transform: sp.Expr


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
    "tau": tau,
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
    "Integral": sp.Integral,
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
    sp.Limit,
    sp.Sum,
    sp.Product,
    sp.DiracDelta,
    sp.SingularityFunction,
)


def solve_direct_laplace(raw_function: str) -> DirectLaplaceSolution:
    expr = parse_time_function(raw_function)
    assert_piecewise_continuous_candidate(expr)
    assert_exponential_order_candidate(expr)
    transform, convergence_plane, condition = compute_validated_transform(expr)

    return DirectLaplaceSolution(
        input_latex=sp.latex(expr),
        transform_latex=sp.latex(transform),
        convergence_latex=None if condition == sp.true else sp.latex(condition),
        steps=build_steps(expr, transform, convergence_plane),
    )


def parse_time_function(raw_function: str) -> sp.Expr:
    expr = parse_symbolic_expression(raw_function, ALLOWED_LOCALS)

    if expr.free_symbols - {t}:
        raise LaplaceInputError("La funcion directa solo puede depender de t.")

    if expr.has(*UNSUPPORTED_OBJECTS):
        raise LaplaceInputError(
            "Solo se admiten funciones ordinarias, continuas a trozos, para t >= 0."
        )

    for function_atom in expr.atoms(sp.Function):
        if function_atom.func not in ALLOWED_FUNCTIONS:
            raise LaplaceInputError(f"Funcion no admitida: {function_atom.func.__name__}.")

    return sp.simplify(expr)


def parse_symbolic_expression(raw_expression: str, local_dict: dict[str, Any]) -> sp.Expr:
    raw_expression = raw_expression.strip()
    if re.search(r"(__|import|eval|exec|open|lambda|os\.|sys\.)", raw_expression):
        raise LaplaceInputError("La expresion contiene tokens no permitidos.")

    try:
        expr = parse_expr(
            raw_expression,
            local_dict=local_dict,
            global_dict=ALLOWED_GLOBALS,
            transformations=TRANSFORMATIONS,
            evaluate=True,
        )
    except Exception as exc:
        raise LaplaceInputError(f"No se pudo interpretar la expresion: {exc}") from exc

    if not isinstance(expr, sp.Expr):
        raise LaplaceInputError("La entrada debe ser una expresion simbolica.")

    return expr


def iter_piecewise_branches(expr: sp.Expr) -> list[sp.Expr]:
    branches: list[sp.Expr] = []
    for piecewise in expr.atoms(sp.Piecewise):
        branches.extend(branch_expr for branch_expr, _ in piecewise.args)
    return branches or [expr]


def replace_heaviside_initial_values(expr: sp.Expr) -> sp.Expr | None:
    replacements: dict[sp.Expr, sp.Expr] = {}
    for function_atom in expr.atoms(sp.Function):
        if function_atom.func != sp.Heaviside:
            continue

        right_value = heaviside_right_value_at_zero(function_atom)
        if right_value is None:
            return None
        replacements[function_atom] = right_value

    return sp.simplify(expr.xreplace(replacements))


def heaviside_right_value_at_zero(function_atom: sp.Expr) -> sp.Expr | None:
    argument = sp.expand(function_atom.args[0])
    value_at_zero = sp.simplify(argument.subs(t, 0))

    if value_at_zero.is_positive:
        return sp.Integer(1)
    if value_at_zero.is_negative:
        return sp.Integer(0)
    if value_at_zero != 0:
        return None

    slope = sp.simplify(sp.diff(argument, t).subs(t, 0))
    if slope.is_positive:
        return sp.Integer(1)
    if slope.is_negative:
        return sp.Integer(0)
    return sp.Rational(1, 2)


def assert_piecewise_continuous_candidate(expr: sp.Expr) -> None:
    for branch_expr in iter_piecewise_branches(expr):
        denominator = sp.denom(sp.together(branch_expr))
        if denominator != 1:
            roots = sp.solveset(denominator, t, domain=sp.Interval(0, sp.oo))
            if roots not in (sp.EmptySet, sp.S.EmptySet):
                raise LaplaceInputError(
                    "La funcion presenta singularidades en t >= 0; no es continua a trozos valida."
                )

        limit_expr = branch_expr
        if branch_expr.has(sp.Heaviside):
            limit_expr = replace_heaviside_initial_values(branch_expr)

        try:
            initial_limit = None if limit_expr is None else sp.limit(limit_expr, t, 0, dir="+")
        except Exception:
            initial_limit = None

        has_infinite_limit = initial_limit in (sp.oo, -sp.oo, sp.zoo)
        if initial_limit is not None and hasattr(initial_limit, "has"):
            has_infinite_limit = has_infinite_limit or initial_limit.has(sp.oo, -sp.oo, sp.zoo)

        if has_infinite_limit:
            raise LaplaceInputError("La funcion debe tener limite lateral finito en t = 0.")


def assert_exponential_order_candidate(expr: sp.Expr) -> None:
    for exponential in expr.atoms(sp.exp):
        exponent = sp.expand(exponential.args[0])
        if not exponent.has(t):
            continue

        try:
            polynomial = sp.Poly(exponent, t)
        except sp.PolynomialError:
            raise LaplaceInputError(
                "No se pudo demostrar que la funcion sea de orden exponencial. "
                "Una funcion como e^{t^2} no posee transformada de Laplace ordinaria."
            )

        degree = polynomial.degree()
        leading_coefficient = polynomial.LC()
        if degree > 1 and leading_coefficient.is_positive is not False:
            raise LaplaceInputError(
                "La funcion no es de orden exponencial: e^{t^2} crece mas rapido "
                "que cualquier e^{a t}, por lo que no existe su transformada de Laplace ordinaria."
            )


def compute_validated_transform(expr: sp.Expr) -> tuple[sp.Expr, sp.Expr | None, sp.Expr]:
    try:
        transform, convergence_plane, condition = sp.laplace_transform(expr, t, s, noconds=False)
    except Exception:
        transform, convergence_plane, condition = compute_expression_transform(expr), None, sp.true

    if transform.has(LaplaceTransform):
        transform = compute_expression_transform(expr)
        convergence_plane = None
        condition = sp.true

    if transform.has(LaplaceTransform):
        raise LaplaceInputError(
            "No se pudo calcular la transformada con la tabla implementada ni con SymPy."
        )

    if condition == sp.false or convergence_plane in (sp.oo, sp.zoo):
        raise LaplaceInputError(
            "La funcion no cumple una region de convergencia valida para la transformada de Laplace."
        )

    return sp.simplify(transform), convergence_plane, condition


def compute_expression_transform(expr: sp.Expr) -> sp.Expr:
    terms = list(sp.Add.make_args(sp.expand(expr, mul=True)))
    transforms = [compute_term_transform(term) for term in terms]
    return sp.simplify(sp.Add(*transforms))


def compute_term_transform(term: sp.Expr) -> sp.Expr:
    t_axis_shift = detect_t_axis_shift(term)
    if t_axis_shift is not None:
        shift, original_function = t_axis_shift
        original_transform = compute_term_transform(original_function)
        return sp.simplify(sp.exp(-shift * s) * original_transform)

    integral_match = detect_integral_from_zero_to_t(term)
    if integral_match is not None:
        coefficient, integrand = integral_match
        base_transform = compute_expression_transform(integrand.subs(tau, t))
        return sp.simplify(coefficient * base_transform / s)

    try:
        transform = sp.laplace_transform(term, t, s, noconds=True)
    except Exception as exc:
        raise LaplaceInputError(f"SymPy no pudo calcular la transformada del termino: {exc}") from exc

    if transform.has(LaplaceTransform):
        raise LaplaceInputError(
            "No se pudo calcular un termino con la tabla disponible. "
            "Verifica que sea continua por tramos y de orden exponencial."
        )

    return sp.simplify(transform)


def detect_integral_from_zero_to_t(term: sp.Expr) -> tuple[sp.Expr, sp.Expr] | None:
    coefficient, base = term.as_coeff_Mul()
    if not isinstance(base, sp.Integral) or len(base.limits) != 1:
        return None

    variable, lower_limit, upper_limit = base.limits[0]
    if variable != tau or lower_limit != 0 or upper_limit != t:
        return None

    return sp.sympify(coefficient), base.function


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


def detect_t_axis_shift(term: sp.Expr) -> tuple[sp.Expr, sp.Expr] | None:
    for function_atom in term.atoms(sp.Function):
        if function_atom.func != sp.Heaviside:
            continue

        argument = sp.expand(function_atom.args[0])
        if sp.diff(argument, t) != 1:
            continue

        shift = sp.simplify(-argument.subs(t, 0))
        if shift.has(t):
            continue

        remainder = sp.simplify(term / function_atom)
        original_function = sp.simplify(remainder.subs(t, t + shift))
        if original_function.has(sp.Heaviside):
            continue
        return shift, original_function

    return None


def detect_t_power(term: sp.Expr) -> tuple[int, sp.Expr] | None:
    exponent = term.as_powers_dict().get(t)
    if exponent is None or not exponent.is_integer or int(exponent) <= 0:
        return None

    n = int(exponent)
    return n, sp.simplify(term / (t**n))


def recognize_basic_table(base: sp.Expr) -> TableMatch | None:
    base = sp.simplify(base)
    if base == 1:
        return TableMatch("constante 1", r"\mathcal{L}\{1\}=\frac{1}{s}", 1 / s)

    power = base.as_powers_dict().get(t)
    if power is not None and power.is_integer and int(power) >= 0 and sp.simplify(base / (t**int(power))) == 1:
        n = int(power)
        transform = sp.factorial(n) / (s ** (n + 1))
        formula = (
            r"\mathcal{L}\{t^{"
            + str(n)
            + r"}\}=\frac{"
            + str(math.factorial(n))
            + r"}{s^{"
            + str(n + 1)
            + r"}}"
        )
        return TableMatch("potencia t^n", formula, transform)

    if base.func == sp.exp:
        exponent = sp.expand(base.args[0])
        a = sp.simplify(sp.diff(exponent, t))
        if not a.has(t) and sp.simplify(exponent - a * t) == 0:
            return TableMatch(
                "exponencial",
                r"\mathcal{L}\{e^{" + sp.latex(a) + r"t}\}=\frac{1}{s-" + sp.latex(a) + "}",
                1 / (s - a),
            )

    for func, name, numerator, denominator_sign in (
        (sp.sin, "seno", "k", 1),
        (sp.cos, "coseno", "s", 1),
        (sp.sinh, "seno hiperbolico", "k", -1),
        (sp.cosh, "coseno hiperbolico", "s", -1),
    ):
        if base.func != func:
            continue

        argument = sp.expand(base.args[0])
        k = sp.simplify(sp.diff(argument, t))
        if k.has(t) or sp.simplify(argument - k * t) != 0:
            continue

        denominator = s**2 + denominator_sign * k**2
        transform = (k if numerator == "k" else s) / denominator
        formula = (
            r"\mathcal{L}\{"
            + sp.latex(func(k * t))
            + r"\}="
            + sp.latex(transform)
        )
        return TableMatch(name, formula, transform)

    return None


def latex_of_laplace(expr: sp.Expr) -> str:
    return r"\mathcal{L}\left\{" + sp.latex(expr) + r"\right\}"


def latex_laplace_body(body: str) -> str:
    return r"\mathcal{L}\left\{" + body + r"\right\}"


def build_steps(
    expr: sp.Expr,
    final_transform: sp.Expr,
    convergence_plane: sp.Expr | None,
) -> list[ResolutionStepData]:
    steps: list[ResolutionStepData] = [
        ResolutionStepData(
            explanation="Definicion formal de la transformada de Laplace como integral impropia.",
            equation=(
                latex_of_laplace(expr)
                + r"=\int_{0}^{\infty} e^{-s t}\left("
                + sp.latex(expr)
                + r"\right)\,dt"
            ),
        ),
        ResolutionStepData(
            explanation=(
                "Se valida analiticamente que la entrada depende de t, es continua por tramos "
                "para t >= 0 y es de orden exponencial."
            ),
            equation="f(t)=" + sp.latex(expr),
        ),
    ]

    append_periodic_step(steps, expr)

    expanded_expr = sp.expand(expr, mul=True)
    terms = list(sp.Add.make_args(expanded_expr))

    if len(terms) > 1:
        separated_terms = "+".join(latex_of_laplace(term) for term in terms)
        steps.append(
            ResolutionStepData(
                explanation=(
                    "Aplicando la propiedad de Linealidad, la transformada de una suma "
                    "es la suma de las transformadas."
                ),
                equation=latex_of_laplace(expanded_expr) + "=" + separated_terms,
            )
        )

    term_transforms: list[sp.Expr] = []
    for term in terms:
        append_constant_factor_step(steps, term)
        append_table_step(steps, term)
        append_exponential_shift_step(steps, term)
        append_t_axis_shift_step(steps, term)
        append_t_power_step(steps, term)
        append_integral_step(steps, term)

        term_transform = compute_term_transform(term)
        term_transforms.append(term_transform)
        steps.append(
            ResolutionStepData(
                explanation=(
                    "Evaluando el termino y expresando el resultado en el dominio de frecuencia s."
                ),
                equation=latex_of_laplace(term) + "=" + sp.latex(term_transform),
            )
        )

    combined_transform = sp.Add(*term_transforms)
    simplified_transform = sp.simplify(combined_transform)
    if len(term_transforms) > 1 or simplified_transform != combined_transform:
        steps.append(
            ResolutionStepData(
                explanation=(
                    "Simplificando algebraicamente la suma obtenida despues de aplicar "
                    "las propiedades anteriores."
                ),
                equation=sp.latex(combined_transform) + "=" + sp.latex(simplified_transform),
            )
        )

    final_equation = latex_of_laplace(expr) + "=" + sp.latex(final_transform)
    if convergence_plane is not None and convergence_plane != -sp.oo:
        final_equation += r",\quad \operatorname{Re}(s)>" + sp.latex(convergence_plane)

    steps.append(
        ResolutionStepData(
            explanation="Resultado final de la transformada directa de Laplace.",
            equation=final_equation,
        )
    )

    return steps


def append_constant_factor_step(steps: list[ResolutionStepData], term: sp.Expr) -> None:
    coefficient, base = term.as_coeff_Mul()
    if coefficient == 1 or base == 1:
        return

    steps.append(
        ResolutionStepData(
            explanation=(
                "Extrayendo la constante multiplicativa por linealidad de la transformada."
            ),
            equation=latex_of_laplace(term) + "=" + sp.latex(coefficient) + latex_of_laplace(base),
        )
    )


def append_table_step(steps: list[ResolutionStepData], term: sp.Expr) -> None:
    coefficient, base = term.as_coeff_Mul()
    match = recognize_basic_table(base)
    if match is None:
        return

    equation = match.formula_latex
    if coefficient != 1:
        equation += r"\quad\Rightarrow\quad " + latex_of_laplace(term) + "=" + sp.latex(
            sp.simplify(coefficient * match.transform)
        )

    steps.append(
        ResolutionStepData(
            explanation="Aplicando la tabla estandar de transformadas basicas: " + match.name + ".",
            equation=equation,
        )
    )


def append_periodic_step(steps: list[ResolutionStepData], expr: sp.Expr) -> None:
    try:
        period = sp.periodicity(expr, t)
    except Exception:
        period = None

    if period in (None, 0) or period.has(t):
        return

    steps.append(
        ResolutionStepData(
            explanation=(
                "La funcion es periodica. Cuando se usa esta propiedad, se aplica "
                "L{f(t)} = (integral de un periodo)/(1 - e^{-sT})."
            ),
            equation=(
                r"T="
                + sp.latex(period)
                + r",\quad \mathcal{L}\{f(t)\}="
                + r"\frac{\int_{0}^{T}e^{-s t}f(t)\,dt}{1-e^{-sT}}"
            ),
        )
    )


def append_exponential_shift_step(steps: list[ResolutionStepData], term: sp.Expr) -> None:
    shift = detect_exponential_shift(term)
    if shift is None:
        return

    a, base = shift
    if base == 1:
        return

    base_transform = compute_term_transform(base)
    shifted_transform = sp.simplify(base_transform.subs(s, s - a))
    steps.append(
        ResolutionStepData(
            explanation=(
                "Aplicando el Primer Teorema de Traslacion en el eje s, un factor "
                "e^{at} desplaza F(s) hacia F(s-a)."
            ),
            equation=(
                latex_laplace_body("e^{" + sp.latex(a * t) + "}" + sp.latex(base))
                + "="
                + sp.latex(base_transform.subs(s, s - a))
                + "="
                + sp.latex(shifted_transform)
            ),
        )
    )


def append_t_axis_shift_step(steps: list[ResolutionStepData], term: sp.Expr) -> None:
    shift = detect_t_axis_shift(term)
    if shift is None:
        return

    a, original_function = shift
    original_transform = compute_term_transform(original_function)
    steps.append(
        ResolutionStepData(
            explanation=(
                "Aplicando el Segundo Teorema de Traslacion en el eje t, "
                "u(t-a)f(t-a) se transforma en e^{-as}F(s)."
            ),
            equation=(
                r"\mathcal{L}\{u(t-"
                + sp.latex(a)
                + r")f(t-"
                + sp.latex(a)
                + r")\}=e^{"
                + sp.latex(-a * s)
                + r"}F(s),\quad F(s)="
                + sp.latex(original_transform)
            ),
        )
    )


def append_t_power_step(steps: list[ResolutionStepData], term: sp.Expr) -> None:
    power = detect_t_power(term)
    if power is None:
        return

    n, base = power
    base_transform = compute_term_transform(base)
    differentiated = sp.simplify((-1) ** n * sp.diff(base_transform, s, n))
    steps.append(
        ResolutionStepData(
            explanation=(
                "Aplicando el teorema de la derivada en s, la multiplicacion por t^n "
                "se convierte en derivacion respecto de s."
            ),
            equation=(
                latex_laplace_body("t^{" + str(n) + "}" + sp.latex(base))
                + "="
                + r"(-1)^{"
                + str(n)
                + r"}\frac{d^{"
                + str(n)
                + r"}}{ds^{"
                + str(n)
                + r"}}\left("
                + sp.latex(base_transform)
                + r"\right)="
                + sp.latex(differentiated)
            ),
        )
    )


def append_integral_step(steps: list[ResolutionStepData], term: sp.Expr) -> None:
    integral_match = detect_integral_from_zero_to_t(term)
    if integral_match is None:
        return

    coefficient, integrand = integral_match
    integrand_t = integrand.subs(tau, t)
    base_transform = compute_expression_transform(integrand_t)
    steps.append(
        ResolutionStepData(
            explanation=(
                "Aplicando la propiedad de transformada de una integral: "
                "L{int_0^t f(tau)d tau}=F(s)/s."
            ),
            equation=(
                latex_of_laplace(term)
                + "="
                + sp.latex(coefficient)
                + r"\frac{"
                + sp.latex(base_transform)
                + r"}{s}"
            ),
        )
    )
