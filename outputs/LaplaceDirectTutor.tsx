import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { BlockMath } from "react-katex";
import "katex/dist/katex.min.css";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LaplaceStep = {
  explanation: string;
  equation: string;
};

type DirectLaplaceResponse = {
  input_latex: string;
  transform_latex: string;
  convergence_latex: string | null;
  steps: LaplaceStep[];
};

type DirectLaplaceRequest = {
  function: string;
};

type ApiErrorPayload = {
  detail?: string | Array<{ msg?: string }>;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function calculateDirectLaplace(payload: DirectLaplaceRequest): Promise<DirectLaplaceResponse> {
  const response = await fetch(`${API_BASE_URL}/laplace/direct`, {
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
      throw new Error(detail.map((item) => item.msg).filter(Boolean).join(" "));
    }

    throw new Error("No se pudo calcular la transformada.");
  }

  return (await response.json()) as DirectLaplaceResponse;
}

export function LaplaceDirectTutor() {
  const [timeFunction, setTimeFunction] = useState("exp(-2*t)*sin(3*t) + t**2");

  const mutation = useMutation<DirectLaplaceResponse, Error, DirectLaplaceRequest>({
    mutationFn: calculateDirectLaplace,
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate({ function: timeFunction });
  }

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle>Calculadora y Tutor de Transformadas de Laplace</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="time-function">f(t)</Label>
              <Input
                id="time-function"
                value={timeFunction}
                onChange={(event) => setTimeFunction(event.target.value)}
                placeholder="exp(-2*t)*sin(3*t) + t**2"
                spellCheck={false}
              />
            </div>
            <Button type="submit" disabled={mutation.isPending || timeFunction.trim().length === 0}>
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Calcular
            </Button>
          </form>
        </CardContent>
      </Card>

      {mutation.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      ) : null}

      {mutation.data ? (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Resultado</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <BlockMath math={`\\mathcal{L}\\{${mutation.data.input_latex}\\}=${mutation.data.transform_latex}`} />
            </CardContent>
          </Card>

          <ol className="space-y-4">
            {mutation.data.steps.map((step, index) => (
              <li key={`${index}-${step.equation}`} className="rounded-lg border bg-background p-4 shadow-sm">
                <div className="mb-3 flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-muted-foreground">{step.explanation}</p>
                </div>
                <div className="overflow-x-auto rounded-md bg-muted/40 p-3">
                  <BlockMath math={step.equation} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
