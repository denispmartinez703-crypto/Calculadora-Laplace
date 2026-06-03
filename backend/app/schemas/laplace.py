from __future__ import annotations

from pydantic import BaseModel, Field


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


class InverseLaplaceRequest(BaseModel):
    expression: str = Field(
        min_length=1,
        max_length=300,
        examples=["(s + 3)/(s**2 + 3*s + 2)"],
    )


class InverseLaplaceResponse(BaseModel):
    input_latex: str
    result_latex: str
    steps: list[ResolutionStep]


class OdeLaplaceRequest(BaseModel):
    equation: str = Field(
        min_length=1,
        max_length=500,
        examples=["y'' + 3*y' + 2*y = 0"],
    )
    initial_conditions: dict[str, str | int | float] = Field(
        default_factory=dict,
        examples=[{"y(0)": 1, "y'(0)": 0}],
    )


class OdeLaplaceResponse(BaseModel):
    equation_latex: str
    solution_latex: str
    steps: list[ResolutionStep]
