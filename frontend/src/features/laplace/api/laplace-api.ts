import type {
  ApiErrorPayload,
  DirectLaplaceRequest,
  DirectLaplaceResponse,
  InverseLaplaceRequest,
  InverseLaplaceResponse,
  OdeLaplaceRequest,
  OdeLaplaceResponse,
} from "@/features/laplace/types";


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";


export async function calculateDirectLaplace(
  payload: DirectLaplaceRequest,
): Promise<DirectLaplaceResponse> {
  return postJson<DirectLaplaceResponse>("/laplace/direct", payload);
}


export async function calculateInverseLaplace(
  payload: InverseLaplaceRequest,
): Promise<InverseLaplaceResponse> {
  return postJson<InverseLaplaceResponse>("/laplace/inverse", payload);
}


export async function solveLaplaceOde(payload: OdeLaplaceRequest): Promise<OdeLaplaceResponse> {
  return postJson<OdeLaplaceResponse>("/laplace/ode", payload);
}


export async function checkApiHealth(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/health`);

  if (!response.ok) {
    throw new Error("No se pudo conectar con FastAPI.");
  }

  return (await response.json()) as { status: string };
}


async function postJson<TResponse>(path: string, payload: unknown): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
    const detail = errorPayload.detail;

    if (typeof detail === "string") {
      throw new Error(detail);
    }

    if (Array.isArray(detail)) {
      const messages = detail.map((item) => item.msg).filter(Boolean);
      throw new Error(messages.join(" ") || "La entrada no es valida.");
    }

    throw new Error("No se pudo calcular la transformada.");
  }

  return (await response.json()) as TResponse;
}
