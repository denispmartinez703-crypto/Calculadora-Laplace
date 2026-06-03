from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.laplace import (
    DirectLaplaceRequest,
    DirectLaplaceResponse,
    InverseLaplaceRequest,
    InverseLaplaceResponse,
    OdeLaplaceRequest,
    OdeLaplaceResponse,
    ResolutionStep,
)
from app.services.laplace_direct import LaplaceInputError, solve_direct_laplace
from app.services.laplace_inverse import solve_inverse_laplace
from app.services.laplace_ode import solve_ode_laplace


router = APIRouter(prefix="/laplace", tags=["laplace"])


@router.post("/direct", response_model=DirectLaplaceResponse)
def direct_laplace(payload: DirectLaplaceRequest) -> DirectLaplaceResponse:
    try:
        solution = solve_direct_laplace(payload.function)
    except LaplaceInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return DirectLaplaceResponse(
        input_latex=solution.input_latex,
        transform_latex=solution.transform_latex,
        convergence_latex=solution.convergence_latex,
        steps=[
            ResolutionStep(explanation=step.explanation, equation=step.equation)
            for step in solution.steps
        ],
    )


@router.post("/inverse", response_model=InverseLaplaceResponse)
def inverse_laplace(payload: InverseLaplaceRequest) -> InverseLaplaceResponse:
    try:
        solution = solve_inverse_laplace(payload.expression)
    except LaplaceInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return InverseLaplaceResponse(
        input_latex=solution.input_latex,
        result_latex=solution.result_latex,
        steps=[
            ResolutionStep(explanation=step.explanation, equation=step.equation)
            for step in solution.steps
        ],
    )


@router.post("/ode", response_model=OdeLaplaceResponse)
def ode_laplace(payload: OdeLaplaceRequest) -> OdeLaplaceResponse:
    try:
        solution = solve_ode_laplace(payload.equation, payload.initial_conditions)
    except LaplaceInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return OdeLaplaceResponse(
        equation_latex=solution.equation_latex,
        solution_latex=solution.solution_latex,
        steps=[
            ResolutionStep(explanation=step.explanation, equation=step.equation)
            for step in solution.steps
        ],
    )
