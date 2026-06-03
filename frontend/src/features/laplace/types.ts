export type LaplaceStep = {
  explanation: string;
  equation: string;
};

export type DirectLaplaceRequest = {
  function: string;
};

export type DirectLaplaceResponse = {
  input_latex: string;
  transform_latex: string;
  convergence_latex: string | null;
  steps: LaplaceStep[];
};

export type InverseLaplaceRequest = {
  expression: string;
};

export type InverseLaplaceResponse = {
  input_latex: string;
  result_latex: string;
  steps: LaplaceStep[];
};

export type OdeLaplaceRequest = {
  equation: string;
  initial_conditions: Record<string, string>;
};

export type OdeLaplaceResponse = {
  equation_latex: string;
  solution_latex: string;
  steps: LaplaceStep[];
};

export type ApiErrorPayload = {
  detail?: string | Array<{ msg?: string }>;
};
