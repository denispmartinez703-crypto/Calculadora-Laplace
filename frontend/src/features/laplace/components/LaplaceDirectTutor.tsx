import {
  type FormEvent,
  type RefObject,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Activity,
  BookMarked,
  BookOpen,
  Braces,
  Calculator,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileText,
  History,
  KeyRound,
  Library,
  Loader2,
  Moon,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sigma,
  Terminal,
  Zap,
} from "lucide-react";
import { BlockMath, InlineMath } from "react-katex";

import {
  calculateDirectLaplace,
  calculateInverseLaplace,
  checkApiHealth,
  solveLaplaceOde,
} from "@/features/laplace/api/laplace-api";
import type {
  DirectLaplaceRequest,
  DirectLaplaceResponse,
  InverseLaplaceRequest,
  InverseLaplaceResponse,
  LaplaceStep,
  OdeLaplaceRequest,
  OdeLaplaceResponse,
} from "@/features/laplace/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";


type TransformMode = "direct" | "inverse" | "ode";
type ActiveField = "direct" | "inverse" | "ode" | "y0" | "dy0";
type AppView = "workspace" | "history" | "documentation" | "library" | "settings";

type SymbolSnippet = {
  label: string;
  value: string;
  modes: TransformMode[];
};

type SolverResult =
  | {
      mode: "direct";
      result: DirectLaplaceResponse;
    }
  | {
      mode: "inverse";
      result: InverseLaplaceResponse;
    }
  | {
      mode: "ode";
      result: OdeLaplaceResponse;
    };

type CalculationHistoryEntry = {
  id: string;
  createdAt: string;
  input: string;
  mode: TransformMode;
  result: SolverResult;
};

type ApiHealthState = {
  latencyMs?: number;
  message: string;
  status: "idle" | "checking" | "online" | "offline";
};

type LibraryItem = {
  category: "Fundamental" | "Operacional" | "EDO";
  description: string;
  expression: string;
  formula: string;
  mode: TransformMode;
  title: string;
};


const HISTORY_STORAGE_KEY = "laplace-engine-history-v1";

const modeOptions: Array<{
  id: TransformMode;
  title: string;
  description: string;
}> = [
  {
    id: "direct",
    title: "Directa",
    description: "f(t) hacia F(s)",
  },
  {
    id: "inverse",
    title: "Inversa",
    description: "F(s) hacia f(t)",
  },
  {
    id: "ode",
    title: "EDO",
    description: "PVI con condiciones iniciales",
  },
];

const examples: Record<TransformMode, Array<{ label: string; value: string }>> = {
  direct: [
    { label: "Polinomio", value: "t**2" },
    { label: "Traslacion s", value: "exp(-2*t)*sin(3*t)" },
    { label: "Linealidad", value: "3*t + cos(4*t)" },
    { label: "Integral", value: "Integral(sin(tau),(tau,0,t))" },
    { label: "Escalon", value: "Heaviside(t-2)*(t-2)" },
  ],
  inverse: [
    { label: "Exponencial", value: "1/(s+2)" },
    { label: "Fracciones", value: "(s + 3)/(s**2 + 3*s + 2)" },
    { label: "Seno", value: "3/(s**2 + 9)" },
  ],
  ode: [
    { label: "2do orden", value: "y'' + 3*y' + 2*y = 0" },
    { label: "Forzada", value: "y'' + y = sin(t)" },
    { label: "1er orden", value: "y' + 2*y = 0" },
  ],
};

const symbolGroups: Array<{
  title: string;
  symbols: SymbolSnippet[];
}> = [
  {
    title: "Basicos",
    symbols: [
      { label: "t", value: "t", modes: ["direct", "ode"] },
      { label: "s", value: "s", modes: ["inverse"] },
      { label: "pi", value: "pi", modes: ["direct", "inverse", "ode"] },
      { label: "^2", value: "**2", modes: ["direct", "inverse", "ode"] },
      { label: "+", value: " + ", modes: ["direct", "inverse", "ode"] },
      { label: "*", value: "*", modes: ["direct", "inverse", "ode"] },
    ],
  },
  {
    title: "Tabla",
    symbols: [
      { label: "sin", value: "sin(t)", modes: ["direct", "ode"] },
      { label: "cos", value: "cos(t)", modes: ["direct", "ode"] },
      { label: "sinh", value: "sinh(t)", modes: ["direct"] },
      { label: "cosh", value: "cosh(t)", modes: ["direct"] },
      { label: "exp", value: "exp(-2*t)", modes: ["direct", "ode"] },
      { label: "1/(s+a)", value: "1/(s+2)", modes: ["inverse"] },
    ],
  },
  {
    title: "Propiedades",
    symbols: [
      { label: "Heaviside", value: "Heaviside(t-2)", modes: ["direct"] },
      { label: "u(t-a)f", value: "Heaviside(t-2)*(t-2)", modes: ["direct"] },
      { label: "Integral", value: "Integral(sin(tau),(tau,0,t))", modes: ["direct"] },
      { label: "fraccion", value: "(s + 3)/(s**2 + 3*s + 2)", modes: ["inverse"] },
    ],
  },
  {
    title: "EDO",
    symbols: [
      { label: "y", value: "y", modes: ["ode"] },
      { label: "y'", value: "y'", modes: ["ode"] },
      { label: "y''", value: "y''", modes: ["ode"] },
      { label: "Derivada", value: "Derivative(y(t), t)", modes: ["ode"] },
      { label: "2da derivada", value: "Derivative(y(t), t, 2)", modes: ["ode"] },
    ],
  },
];

const transformRows = [
  { from: "1", to: "\\frac{1}{s}" },
  { from: "t^n", to: "\\frac{n!}{s^{n+1}}" },
  { from: "e^{at}", to: "\\frac{1}{s-a}" },
  { from: "\\sin(\\omega t)", to: "\\frac{\\omega}{s^2+\\omega^2}" },
];

const libraryItems: LibraryItem[] = [
  {
    category: "Fundamental",
    description: "Transformada de una constante unitaria.",
    expression: "1",
    formula: "\\mathcal{L}\\{1\\}=\\frac{1}{s}",
    mode: "direct",
    title: "Constante",
  },
  {
    category: "Fundamental",
    description: "Transformada de una potencia entera no negativa.",
    expression: "t**2",
    formula: "\\mathcal{L}\\{t^n\\}=\\frac{n!}{s^{n+1}}",
    mode: "direct",
    title: "Potencia de t",
  },
  {
    category: "Fundamental",
    description: "Transformada de una exponencial real.",
    expression: "exp(-2*t)",
    formula: "\\mathcal{L}\\{e^{at}\\}=\\frac{1}{s-a}",
    mode: "direct",
    title: "Exponencial",
  },
  {
    category: "Operacional",
    description: "Desplazamiento en el dominio de frecuencia.",
    expression: "exp(-2*t)*sin(3*t)",
    formula: "\\mathcal{L}\\{e^{at}f(t)\\}=F(s-a)",
    mode: "direct",
    title: "Primer teorema de traslacion",
  },
  {
    category: "Operacional",
    description: "Desplazamiento temporal con funcion escalon.",
    expression: "Heaviside(t-2)*(t-2)",
    formula: "\\mathcal{L}\\{u(t-a)f(t-a)\\}=e^{-as}F(s)",
    mode: "direct",
    title: "Segundo teorema de traslacion",
  },
  {
    category: "Operacional",
    description: "Inversa por fracciones parciales.",
    expression: "(s + 3)/(s**2 + 3*s + 2)",
    formula: "\\mathcal{L}^{-1}\\{F(s)\\}=f(t)",
    mode: "inverse",
    title: "Fracciones parciales",
  },
  {
    category: "EDO",
    description: "Problema de valor inicial de segundo orden.",
    expression: "y'' + 3*y' + 2*y = 0",
    formula: "\\mathcal{L}\\{y''\\}=s^2Y(s)-sy(0)-y'(0)",
    mode: "ode",
    title: "EDO por Laplace",
  },
];


export function LaplaceDirectTutor() {
  const [activeView, setActiveView] = useState<AppView>("workspace");
  const [mode, setMode] = useState<TransformMode>("direct");
  const [directExpression, setDirectExpression] = useState("exp(-2*t)*sin(3*t) + t**2");
  const [inverseExpression, setInverseExpression] = useState("1/(s+2)");
  const [odeEquation, setOdeEquation] = useState("y'' + 3*y' + 2*y = 0");
  const [initialY0, setInitialY0] = useState("1");
  const [initialDy0, setInitialDy0] = useState("0");
  const [activeField, setActiveField] = useState<ActiveField>("direct");
  const [lastResult, setLastResult] = useState<SolverResult | null>(null);
  const [tutorialMode, setTutorialMode] = useState(true);
  const [apiHealth, setApiHealth] = useState<ApiHealthState>({
    message: "Sin verificar",
    status: "idle",
  });
  const [historyEntries, setHistoryEntries] = useState<CalculationHistoryEntry[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const rawHistory = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      return rawHistory ? (JSON.parse(rawHistory) as CalculationHistoryEntry[]) : [];
    } catch {
      return [];
    }
  });

  const directRef = useRef<HTMLTextAreaElement>(null);
  const inverseRef = useRef<HTMLTextAreaElement>(null);
  const odeRef = useRef<HTMLTextAreaElement>(null);
  const y0Ref = useRef<HTMLInputElement>(null);
  const dy0Ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyEntries));
  }, [historyEntries]);

  const directMutation = useMutation<DirectLaplaceResponse, Error, DirectLaplaceRequest>({
    mutationFn: calculateDirectLaplace,
    onSuccess: (result, payload) => {
      const solverResult: SolverResult = { mode: "direct", result };
      setLastResult(solverResult);
      appendHistoryEntry("direct", payload.function, solverResult);
    },
  });

  const inverseMutation = useMutation<InverseLaplaceResponse, Error, InverseLaplaceRequest>({
    mutationFn: calculateInverseLaplace,
    onSuccess: (result, payload) => {
      const solverResult: SolverResult = { mode: "inverse", result };
      setLastResult(solverResult);
      appendHistoryEntry("inverse", payload.expression, solverResult);
    },
  });

  const odeMutation = useMutation<OdeLaplaceResponse, Error, OdeLaplaceRequest>({
    mutationFn: solveLaplaceOde,
    onSuccess: (result, payload) => {
      const solverResult: SolverResult = { mode: "ode", result };
      setLastResult(solverResult);
      appendHistoryEntry("ode", payload.equation, solverResult);
    },
  });

  const isPending = directMutation.isPending || inverseMutation.isPending || odeMutation.isPending;
  const currentError = directMutation.error ?? inverseMutation.error ?? odeMutation.error;

  function appendHistoryEntry(modeName: TransformMode, input: string, result: SolverResult) {
    setHistoryEntries((entries) => [
      {
        createdAt: new Date().toISOString(),
        id: crypto.randomUUID(),
        input,
        mode: modeName,
        result,
      },
      ...entries,
    ].slice(0, 12));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMutationState();

    if (mode === "direct") {
      directMutation.mutate({ function: directExpression });
      return;
    }

    if (mode === "inverse") {
      inverseMutation.mutate({ expression: inverseExpression });
      return;
    }

    const initialConditions: Record<string, string> = {};
    if (initialY0.trim()) {
      initialConditions["y(0)"] = initialY0;
    }
    if (initialDy0.trim()) {
      initialConditions.dy0 = initialDy0;
    }

    odeMutation.mutate({
      equation: odeEquation,
      initial_conditions: initialConditions,
    });
  }

  function clearMutationState() {
    directMutation.reset();
    inverseMutation.reset();
    odeMutation.reset();
  }

  function switchMode(nextMode: TransformMode) {
    setMode(nextMode);
    setActiveField(nextMode);
    clearMutationState();
    setLastResult(null);
  }

  function startNewTransform() {
    setActiveView("workspace");
    setMode("direct");
    setActiveField("direct");
    setDirectExpression("");
    setInverseExpression("1/(s+2)");
    setOdeEquation("y'' + 3*y' + 2*y = 0");
    setInitialY0("1");
    setInitialDy0("0");
    clearMutationState();
    setLastResult(null);
    window.requestAnimationFrame(() => directRef.current?.focus());
  }

  function applyExample(value: string) {
    if (mode === "direct") {
      setDirectExpression(value);
      setActiveField("direct");
      return;
    }
    if (mode === "inverse") {
      setInverseExpression(value);
      setActiveField("inverse");
      return;
    }
    setOdeEquation(value);
    setActiveField("ode");
  }

  function loadLibraryItem(item: LibraryItem) {
    setActiveView("workspace");
    setMode(item.mode);
    setActiveField(item.mode);
    clearMutationState();
    setLastResult(null);

    if (item.mode === "direct") {
      setDirectExpression(item.expression);
    } else if (item.mode === "inverse") {
      setInverseExpression(item.expression);
    } else {
      setOdeEquation(item.expression);
    }
  }

  function restoreHistoryEntry(entry: CalculationHistoryEntry) {
    setActiveView("workspace");
    setMode(entry.mode);
    setActiveField(entry.mode);
    setLastResult(entry.result);

    if (entry.mode === "direct") {
      setDirectExpression(entry.input);
    } else if (entry.mode === "inverse") {
      setInverseExpression(entry.input);
    } else {
      setOdeEquation(entry.input);
    }
  }

  async function handleCheckApi() {
    const startedAt = performance.now();
    setApiHealth({ message: "Verificando conexion...", status: "checking" });

    try {
      const response = await checkApiHealth();
      setApiHealth({
        latencyMs: Math.round(performance.now() - startedAt),
        message: `FastAPI respondio: ${response.status}`,
        status: "online",
      });
    } catch (error) {
      setApiHealth({
        message: error instanceof Error ? error.message : "No se pudo conectar con FastAPI.",
        status: "offline",
      });
    }
  }

  function insertSnippet(snippet: string) {
    if (activeField === "direct") {
      insertIntoTextarea(directRef.current, directExpression, setDirectExpression, snippet);
      return;
    }
    if (activeField === "inverse") {
      insertIntoTextarea(inverseRef.current, inverseExpression, setInverseExpression, snippet);
      return;
    }
    if (activeField === "ode") {
      insertIntoTextarea(odeRef.current, odeEquation, setOdeEquation, snippet);
      return;
    }
    if (activeField === "y0") {
      insertIntoInput(y0Ref.current, initialY0, setInitialY0, snippet);
      return;
    }
    insertIntoInput(dy0Ref.current, initialDy0, setInitialDy0, snippet);
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-foreground">
      <AppSidebar
        activeView={activeView}
        onNewTransform={startNewTransform}
        onViewChange={setActiveView}
      />

      <main className="min-h-screen lg:ml-[280px]">
        <AppHeader
          activeView={activeView}
          tutorialMode={tutorialMode}
          onToggleTutorialMode={() => setTutorialMode((enabled) => !enabled)}
        />
        <MobileNav
          activeView={activeView}
          onNewTransform={startNewTransform}
          onViewChange={setActiveView}
        />

        {activeView === "workspace" ? (
          <WorkspaceView
            activeField={activeField}
            currentError={currentError}
            directExpression={directExpression}
            directRef={directRef}
            dy0Ref={dy0Ref}
            initialDy0={initialDy0}
            initialY0={initialY0}
            inverseExpression={inverseExpression}
            inverseRef={inverseRef}
            isPending={isPending}
            lastResult={lastResult}
            mode={mode}
            odeEquation={odeEquation}
            odeRef={odeRef}
            onApplyExample={applyExample}
            onClearResult={() => setLastResult(null)}
            onInsert={insertSnippet}
            onSetActiveField={setActiveField}
            onSetDirectExpression={setDirectExpression}
            onSetInitialDy0={setInitialDy0}
            onSetInitialY0={setInitialY0}
            onSetInverseExpression={setInverseExpression}
            onSetOdeEquation={setOdeEquation}
            onSubmit={handleSubmit}
            onSwitchMode={switchMode}
            tutorialMode={tutorialMode}
            y0Ref={y0Ref}
          />
        ) : null}

        {activeView === "history" ? (
          <HistoryView
            entries={historyEntries}
            onClearHistory={() => setHistoryEntries([])}
            onRestore={restoreHistoryEntry}
          />
        ) : null}

        {activeView === "documentation" ? (
          <DocumentationView onOpenSettings={() => setActiveView("settings")} />
        ) : null}

        {activeView === "library" ? (
          <LibraryView items={libraryItems} onLoadItem={loadLibraryItem} />
        ) : null}

        {activeView === "settings" ? (
          <SettingsView apiHealth={apiHealth} onCheckApi={handleCheckApi} />
        ) : null}

        <footer className="border-t border-border px-4 py-6 sm:px-6 lg:px-10">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 font-mono text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
            <span>LAPLACE ENGINE / Precision symbolic tooling</span>
            <span>FastAPI + SymPy + KaTeX</span>
          </div>
        </footer>
      </main>
    </div>
  );
}


function AppHeader({
  activeView,
  tutorialMode,
  onToggleTutorialMode,
}: {
  activeView: AppView;
  tutorialMode: boolean;
  onToggleTutorialMode: () => void;
}) {
  const copy = viewCopy(activeView);

  return (
    <header className="border-b border-border bg-[#101418]/95 px-4 py-5 backdrop-blur sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">
            {copy.eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
            {copy.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            onClick={onToggleTutorialMode}
          >
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Modo tutorial
            </span>
            <span className="relative h-7 w-12 rounded-full bg-muted">
              <span
                className={[
                  "absolute top-1 h-5 w-5 rounded-full bg-primary shadow-[0_0_12px_rgba(173,198,255,0.35)] transition-all",
                  tutorialMode ? "right-1" : "left-1 opacity-60",
                ].join(" ")}
              />
            </span>
          </button>
          <Button type="button" variant="outline" size="icon" className="border-border bg-card text-foreground">
            <Moon className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="border-border bg-card text-foreground">
            <CircleHelp className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </header>
  );
}


function AppSidebar({
  activeView,
  onNewTransform,
  onViewChange,
}: {
  activeView: AppView;
  onNewTransform: () => void;
  onViewChange: (view: AppView) => void;
}) {
  const navItems: Array<{ id: AppView; label: string; icon: typeof Calculator }> = [
    { id: "workspace", label: "Workspace", icon: Calculator },
    { id: "history", label: "History", icon: History },
    { id: "documentation", label: "Documentation", icon: BookOpen },
    { id: "library", label: "Calculus Ref", icon: Library },
    { id: "settings", label: "API Settings", icon: Settings },
  ];

  return (
    <aside className="hidden w-[280px] flex-col border-r border-border bg-card lg:fixed lg:inset-y-0 lg:flex">
      <div className="border-b border-border p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded bg-primary text-primary-foreground">
            <Sigma className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-6 text-primary">LAPLACE.OS</p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">v4.2.0-stable</p>
          </div>
        </div>

        <Button
          type="button"
          className="mt-7 w-full justify-start gap-3 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={onNewTransform}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Transform
        </Button>
      </div>

      <nav className="flex-1 space-y-2 p-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeView;
          return (
            <button
              key={item.id}
              type="button"
              className={[
                "flex w-full items-center gap-3 rounded-md px-4 py-3 text-left font-mono text-sm transition-colors",
                isActive
                  ? "bg-[#0969da] text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
              onClick={() => onViewChange(item.id)}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <button
          className="flex w-full items-center gap-3 rounded-md px-4 py-3 font-mono text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => onViewChange("documentation")}
          type="button"
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          Docs
        </button>
        <button
          className="flex w-full items-center gap-3 rounded-md px-4 py-3 font-mono text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => onViewChange("library")}
          type="button"
        >
          <Braces className="h-4 w-4" aria-hidden="true" />
          Formula index
        </button>
      </div>
    </aside>
  );
}


function MobileNav({
  activeView,
  onNewTransform,
  onViewChange,
}: {
  activeView: AppView;
  onNewTransform: () => void;
  onViewChange: (view: AppView) => void;
}) {
  const navItems: Array<{ id: AppView; label: string }> = [
    { id: "workspace", label: "Workspace" },
    { id: "history", label: "History" },
    { id: "documentation", label: "Docs" },
    { id: "library", label: "Ref" },
    { id: "settings", label: "API" },
  ];

  return (
    <div className="border-b border-border bg-card px-4 py-3 lg:hidden">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          className="shrink-0 rounded-md bg-primary px-3 py-2 font-mono text-xs text-primary-foreground"
          onClick={onNewTransform}
        >
          + New
        </button>
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={[
              "shrink-0 rounded-md border px-3 py-2 font-mono text-xs",
              item.id === activeView
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-[#0d1117] text-muted-foreground",
            ].join(" ")}
            onClick={() => onViewChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}


function WorkspaceView({
  activeField,
  currentError,
  directExpression,
  directRef,
  dy0Ref,
  initialDy0,
  initialY0,
  inverseExpression,
  inverseRef,
  isPending,
  lastResult,
  mode,
  odeEquation,
  odeRef,
  onApplyExample,
  onClearResult,
  onInsert,
  onSetActiveField,
  onSetDirectExpression,
  onSetInitialDy0,
  onSetInitialY0,
  onSetInverseExpression,
  onSetOdeEquation,
  onSubmit,
  onSwitchMode,
  tutorialMode,
  y0Ref,
}: {
  activeField: ActiveField;
  currentError: Error | null;
  directExpression: string;
  directRef: RefObject<HTMLTextAreaElement>;
  dy0Ref: RefObject<HTMLInputElement>;
  initialDy0: string;
  initialY0: string;
  inverseExpression: string;
  inverseRef: RefObject<HTMLTextAreaElement>;
  isPending: boolean;
  lastResult: SolverResult | null;
  mode: TransformMode;
  odeEquation: string;
  odeRef: RefObject<HTMLTextAreaElement>;
  onApplyExample: (value: string) => void;
  onClearResult: () => void;
  onInsert: (snippet: string) => void;
  onSetActiveField: (field: ActiveField) => void;
  onSetDirectExpression: (value: string) => void;
  onSetInitialDy0: (value: string) => void;
  onSetInitialY0: (value: string) => void;
  onSetInverseExpression: (value: string) => void;
  onSetOdeEquation: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSwitchMode: (mode: TransformMode) => void;
  tutorialMode: boolean;
  y0Ref: RefObject<HTMLInputElement>;
}) {
  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-10">
      <div className="min-w-0 space-y-6">
        <ModeSelector mode={mode} onModeChange={onSwitchMode} />

        <SolverWorkspace
          activeField={activeField}
          directExpression={directExpression}
          directRef={directRef}
          dy0Ref={dy0Ref}
          examples={examples[mode]}
          initialDy0={initialDy0}
          initialY0={initialY0}
          inverseExpression={inverseExpression}
          inverseRef={inverseRef}
          isPending={isPending}
          mode={mode}
          odeEquation={odeEquation}
          odeRef={odeRef}
          onApplyExample={onApplyExample}
          onClearResult={onClearResult}
          onInsert={onInsert}
          onSetActiveField={onSetActiveField}
          onSetDirectExpression={onSetDirectExpression}
          onSetInitialDy0={onSetInitialDy0}
          onSetInitialY0={onSetInitialY0}
          onSetInverseExpression={onSetInverseExpression}
          onSetOdeEquation={onSetOdeEquation}
          onSubmit={onSubmit}
          y0Ref={y0Ref}
        />

        {currentError ? (
          <Alert variant="destructive" className="border-error bg-error/10 text-error">
            <AlertDescription>{currentError.message}</AlertDescription>
          </Alert>
        ) : null}

        {lastResult ? <ResultPanel result={lastResult} /> : <EmptyResultState />}
      </div>

      <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
        {tutorialMode ? <QuickTipPanel mode={mode} onApplyExample={onApplyExample} /> : null}
        <TransformTable />
        <ServerStatus />
      </aside>
    </section>
  );
}


function SolverWorkspace({
  activeField,
  directExpression,
  directRef,
  dy0Ref,
  examples: currentExamples,
  initialDy0,
  initialY0,
  inverseExpression,
  inverseRef,
  isPending,
  mode,
  odeEquation,
  odeRef,
  onApplyExample,
  onClearResult,
  onInsert,
  onSetActiveField,
  onSetDirectExpression,
  onSetInitialDy0,
  onSetInitialY0,
  onSetInverseExpression,
  onSetOdeEquation,
  onSubmit,
  y0Ref,
}: {
  activeField: ActiveField;
  directExpression: string;
  directRef: RefObject<HTMLTextAreaElement>;
  dy0Ref: RefObject<HTMLInputElement>;
  examples: Array<{ label: string; value: string }>;
  initialDy0: string;
  initialY0: string;
  inverseExpression: string;
  inverseRef: RefObject<HTMLTextAreaElement>;
  isPending: boolean;
  mode: TransformMode;
  odeEquation: string;
  odeRef: RefObject<HTMLTextAreaElement>;
  onApplyExample: (value: string) => void;
  onClearResult: () => void;
  onInsert: (snippet: string) => void;
  onSetActiveField: (field: ActiveField) => void;
  onSetDirectExpression: (value: string) => void;
  onSetInitialDy0: (value: string) => void;
  onSetInitialY0: (value: string) => void;
  onSetInverseExpression: (value: string) => void;
  onSetOdeEquation: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  y0Ref: RefObject<HTMLInputElement>;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Workspace activo
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{modeTitle(mode)}</h2>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border bg-[#0d1117] px-3 py-2 font-mono text-xs text-muted-foreground">
          <CircleHelp className="h-4 w-4" aria-hidden="true" />
          Sintaxis: Python/SymPy
        </div>
      </div>

      <form className="space-y-5 p-5" onSubmit={onSubmit}>
        {mode === "direct" ? (
          <ExpressionField
            id="direct-expression"
            label="Funcion f(t)"
            placeholder="exp(-2*t)*sin(3*t) + t**2"
            previewMath={inputPreviewEquation("direct", directExpression)}
            value={directExpression}
            onChange={onSetDirectExpression}
            onFocus={() => onSetActiveField("direct")}
            ref={directRef}
          />
        ) : null}

        {mode === "inverse" ? (
          <ExpressionField
            id="inverse-expression"
            label="Funcion F(s)"
            placeholder="1/(s+2)"
            previewMath={inputPreviewEquation("inverse", inverseExpression)}
            value={inverseExpression}
            onChange={onSetInverseExpression}
            onFocus={() => onSetActiveField("inverse")}
            ref={inverseRef}
          />
        ) : null}

        {mode === "ode" ? (
          <div className="space-y-4">
            <ExpressionField
              id="ode-equation"
              label="Ecuacion diferencial"
              placeholder="y'' + 3*y' + 2*y = 0"
              previewMath={inputPreviewEquation("ode", odeEquation)}
              value={odeEquation}
              onChange={onSetOdeEquation}
              onFocus={() => onSetActiveField("ode")}
              ref={odeRef}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <InitialInput
                id="initial-y0"
                label="y(0)"
                onChange={onSetInitialY0}
                onFocus={() => onSetActiveField("y0")}
                placeholder="1"
                ref={y0Ref}
                value={initialY0}
              />
              <InitialInput
                id="initial-dy0"
                label="y'(0)"
                onChange={onSetInitialDy0}
                onFocus={() => onSetActiveField("dy0")}
                placeholder="0"
                ref={dy0Ref}
                value={initialDy0}
              />
            </div>
          </div>
        ) : null}

        <SnippetTray activeField={activeField} mode={mode} onInsert={onInsert} />

        <div className="flex flex-wrap gap-2">
          {currentExamples.map((example) => (
            <button
              key={example.value}
              type="button"
              className="rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              onClick={() => onApplyExample(example.value)}
            >
              {example.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
          <Button type="button" variant="outline" className="border-border bg-transparent text-foreground" onClick={onClearResult}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Limpiar resultado
          </Button>
          <Button
            type="submit"
            disabled={isPending || !canSubmit(mode, directExpression, inverseExpression, odeEquation)}
            className="min-w-48 bg-primary font-mono text-primary-foreground shadow-[0_12px_28px_rgba(173,198,255,0.18)] hover:bg-primary/90"
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {submitLabel(mode)}
          </Button>
        </div>
      </form>
    </section>
  );
}


type ExpressionFieldProps = {
  id: string;
  label: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  placeholder: string;
  previewMath: string;
  value: string;
};


const ExpressionField = forwardRef<HTMLTextAreaElement, ExpressionFieldProps>(
  ({ id, label, value, placeholder, previewMath, onChange, onFocus }, ref) => {
    return (
      <div className="grid gap-3">
        <Label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground" htmlFor={id}>
          {label}
        </Label>
        <Textarea
          ref={ref}
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          placeholder={placeholder}
          spellCheck={false}
          className="min-h-44 resize-y rounded-lg border-border bg-[#0d1117] p-5 font-mono text-lg leading-8 text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/40"
        />
        <div className="rounded-lg border border-border bg-[#0d1117] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Vista previa matematica
            </p>
            <span className="rounded-full border border-border bg-muted px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground">
              KaTeX
            </span>
          </div>
          {previewMath ? (
            <div className="overflow-x-auto text-foreground">
              <RenderedBlockMath math={previewMath} />
            </div>
          ) : (
            <p className="font-mono text-sm text-muted-foreground">
              Escribe una expresion para verla en notacion matematica.
            </p>
          )}
        </div>
      </div>
    );
  },
);
ExpressionField.displayName = "ExpressionField";


type InitialInputProps = {
  id: string;
  label: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  placeholder: string;
  value: string;
};

const InitialInput = forwardRef<HTMLInputElement, InitialInputProps>(
  ({ id, label, onChange, onFocus, placeholder, value }, ref) => (
    <div className="grid gap-2">
      <Label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground" htmlFor={id}>
        {label}
      </Label>
      <Input
        ref={ref}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        className="h-12 border-border bg-[#0d1117] font-mono text-foreground"
      />
    </div>
  ),
);
InitialInput.displayName = "InitialInput";


function ModeSelector({
  mode,
  onModeChange,
}: {
  mode: TransformMode;
  onModeChange: (mode: TransformMode) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {modeOptions.map((option) => {
        const isActive = option.id === mode;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onModeChange(option.id)}
            className={[
              "rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:border-primary/60",
            ].join(" ")}
          >
            <span className="block font-mono text-xs uppercase tracking-[0.18em]">{option.title}</span>
            <span className={["mt-2 block text-sm", isActive ? "text-primary-foreground/80" : "text-muted-foreground"].join(" ")}>
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}


function SnippetTray({
  activeField,
  mode,
  onInsert,
}: {
  activeField: ActiveField;
  mode: TransformMode;
  onInsert: (snippet: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-[#111820] p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Variable tray
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Campo activo: <span className="font-semibold text-primary">{activeFieldLabel(activeField)}</span>
          </p>
        </div>
        <Braces className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {symbolGroups.map((group) => {
          const symbols = group.symbols.filter((symbol) => symbol.modes.includes(mode));
          if (symbols.length === 0) {
            return null;
          }

          return (
            <div key={group.title} className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {group.title}
              </p>
              <div className="flex flex-wrap gap-2">
                {symbols.map((symbol) => (
                  <button
                    key={`${group.title}-${symbol.label}-${symbol.value}`}
                    type="button"
                    className="rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground transition-colors hover:border-primary hover:text-primary"
                    onClick={() => onInsert(symbol.value)}
                    title={symbol.value}
                  >
                    {symbol.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function HistoryView({
  entries,
  onClearHistory,
  onRestore,
}: {
  entries: CalculationHistoryEntry[];
  onClearHistory: () => void;
  onRestore: (entry: CalculationHistoryEntry) => void;
}) {
  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Historial local</p>
          <h2 className="mt-2 text-2xl font-semibold">Calculos recientes</h2>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-border bg-card text-foreground"
          disabled={entries.length === 0}
          onClick={onClearHistory}
        >
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          Limpiar historial
        </Button>
      </div>

      {entries.length === 0 ? (
        <EmptyPanel
          icon={History}
          title="Todavia no hay calculos"
          description="Cuando resuelvas una transformada, se guardara aqui para que puedas restaurarla."
        />
      ) : (
        <div className="grid gap-4">
          {entries.map((entry) => (
            <article key={entry.id} className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-border bg-muted px-3 py-1 font-mono text-xs uppercase text-primary">
                      {modeTitle(entry.mode)}
                    </span>
                    <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                      <Clock3 className="h-4 w-4" aria-hidden="true" />
                      {formatDateTime(entry.createdAt)}
                    </span>
                  </div>
                  <p className="mt-4 break-words font-mono text-sm text-foreground">{entry.input}</p>
                </div>
                <Button
                  type="button"
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => onRestore(entry)}
                >
                  Restaurar
                </Button>
              </div>
              <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-[#0d1117] p-4">
                <RenderedBlockMath math={resultEquation(entry.result)} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}


function DocumentationView({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-10">
      <div className="grid gap-6 lg:grid-cols-2">
        <InfoCard
          icon={Calculator}
          title="Flujo de calculo"
          body="El frontend envia la expresion a FastAPI, el backend valida la entrada con reglas simbolicas y SymPy calcula la transformada. La respuesta incluye el resultado en LaTeX y una lista de pasos."
        />
        <InfoCard
          icon={Terminal}
          title="Sintaxis aceptada"
          body="Usa expresiones estilo Python/SymPy: t**2, exp(-2*t), sin(t), Heaviside(t-2), Integral(sin(tau),(tau,0,t)) y ecuaciones como y'' + 3*y' + 2*y = 0."
        />
      </div>

      <section className="rounded-lg border border-border bg-card p-6">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">API local</p>
        <h2 className="mt-2 text-2xl font-semibold">Endpoints del motor</h2>
        <div className="mt-5 grid gap-3 font-mono text-sm">
          <EndpointRow method="GET" path="/health" description="Verifica que FastAPI este operativo." />
          <EndpointRow method="POST" path="/laplace/direct" description="Calcula L{f(t)}." />
          <EndpointRow method="POST" path="/laplace/inverse" description="Calcula la transformada inversa." />
          <EndpointRow method="POST" path="/laplace/ode" description="Resuelve PVI por transformada de Laplace." />
        </div>
        <Button type="button" className="mt-6 bg-primary text-primary-foreground hover:bg-primary/90" onClick={onOpenSettings}>
          <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
          Abrir configuracion
        </Button>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Notas de uso</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <DocNote title="Directa" text="La variable de tiempo permitida es t. No uses s en entrada directa." />
          <DocNote title="Inversa" text="La variable de frecuencia permitida es s. Las fracciones racionales funcionan mejor." />
          <DocNote title="EDO" text="Define y(0) y y'(0) cuando la ecuacion sea de segundo orden." />
        </div>
      </section>
    </section>
  );
}


function LibraryView({
  items,
  onLoadItem,
}: {
  items: LibraryItem[];
  onLoadItem: (item: LibraryItem) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) =>
      [item.title, item.description, item.expression, item.formula, item.category]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [items, query]);

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-10">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Tablas y teoremas</p>
          <h2 className="mt-2 text-2xl font-semibold">Biblioteca operacional</h2>
        </div>
        <div className="relative w-full xl:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 border-border bg-card pl-10 font-mono text-sm text-foreground"
            placeholder="Buscar transformadas..."
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredItems.map((item) => (
          <article key={`${item.category}-${item.title}`} className="flex min-h-64 flex-col rounded-lg border border-border bg-card">
            <div className="border-b border-border p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">{item.category}</p>
                  <h3 className="mt-2 text-xl font-semibold">{item.title}</h3>
                </div>
                <span className="rounded-full border border-border bg-muted px-3 py-1 font-mono text-xs uppercase text-muted-foreground">
                  {item.mode}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </div>
            <div className="flex flex-1 flex-col justify-between p-5">
              <div className="overflow-x-auto rounded-md border border-border bg-[#0d1117] p-4">
                <RenderedBlockMath math={item.formula} />
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-5 border-primary/60 bg-transparent text-primary hover:bg-muted"
                onClick={() => onLoadItem(item)}
              >
                <Calculator className="mr-2 h-4 w-4" aria-hidden="true" />
                Cargar en solver
              </Button>
            </div>
          </article>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <EmptyPanel
          icon={Search}
          title="Sin coincidencias"
          description="Prueba buscar por potencia, escalon, inversa, EDO o traslacion."
        />
      ) : null}
    </section>
  );
}


function SettingsView({
  apiHealth,
  onCheckApi,
}: {
  apiHealth: ApiHealthState;
  onCheckApi: () => void;
}) {
  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-10">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Activity className={["h-6 w-6", apiStatusColor(apiHealth.status)].join(" ")} aria-hidden="true" />
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Estado de instancia</p>
                <h2 className="mt-1 text-2xl font-semibold">FastAPI</h2>
              </div>
            </div>
            <span className={["rounded-full border px-3 py-1 font-mono text-xs uppercase", apiStatusPill(apiHealth.status)].join(" ")}>
              {apiHealth.status}
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <StatusMetric label="Endpoint" value="/api/health" tone="primary" />
            <StatusMetric label="Latencia" value={apiHealth.latencyMs ? `${apiHealth.latencyMs} ms` : "--"} tone="accent" />
            <StatusMetric label="Motor" value="SymPy" tone="success" />
          </div>

          <div className="mt-6 rounded-lg border border-border bg-[#0d1117] p-4 font-mono text-sm leading-6 text-muted-foreground">
            <p className={apiStatusColor(apiHealth.status)}>{apiHealth.message}</p>
            <p className="mt-3">Proxy Vite: /api -&gt; http://127.0.0.1:8000</p>
          </div>

          <Button
            type="button"
            className="mt-6 bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={apiHealth.status === "checking"}
            onClick={onCheckApi}
          >
            {apiHealth.status === "checking" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Activity className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Probar conexion
          </Button>
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <KeyRound className="h-6 w-6 text-primary" aria-hidden="true" />
            <h2 className="text-2xl font-semibold">Credenciales API</h2>
          </div>
          <div className="mt-6 space-y-4">
            <FieldPreview label="Servidor" value="http://127.0.0.1:8000" />
            <FieldPreview label="Proxy frontend" value="/api" />
            <FieldPreview label="Autorizacion" value="No requerida en local" />
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-6">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Motor de renderizado</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <SettingOption checked title="KaTeX recomendado" text="Renderizado rapido del lado del cliente para pasos con multiples ecuaciones." />
          <SettingOption checked title="Simplificacion automatica" text="El backend simplifica los resultados antes de enviarlos al frontend." />
          <SettingOption checked title="Variables reales" text="t se declara positiva y real para mejorar validaciones de Laplace." />
          <SettingOption title="Modo compacto" text="Pendiente: reducir espacio vertical en listas largas de pasos." />
        </div>
      </section>
    </section>
  );
}


function QuickTipPanel({
  mode,
  onApplyExample,
}: {
  mode: TransformMode;
  onApplyExample: (value: string) => void;
}) {
  const tip = quickTip(mode);

  return (
    <section className="rounded-lg border border-[#245f37] bg-[#102018] p-5">
      <div className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-[#78dc86]">
        <Zap className="h-4 w-4" aria-hidden="true" />
        Consejo rapido
      </div>
      <h3 className="text-xl font-semibold text-foreground">{tip.title}</h3>
      <p className="mt-3 leading-7 text-muted-foreground">{tip.description}</p>
      <Button
        type="button"
        className="mt-5 w-full border border-[#3d7b4d] bg-[#28553a] text-[#99fea4] hover:bg-[#326545]"
        onClick={() => onApplyExample(tip.example)}
      >
        Cargar ejemplo
      </Button>
    </section>
  );
}


function TransformTable() {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-foreground">
        <BookMarked className="h-4 w-4" aria-hidden="true" />
        Transformadas comunes
      </div>
      <div className="space-y-3 border-t border-border pt-4">
        {transformRows.map((row) => (
          <div key={row.from} className="grid grid-cols-[1fr_auto_1.4fr] items-center gap-3 rounded-md border border-border bg-[#0d1117] p-3 font-mono text-sm">
            <span className="text-foreground">
              <RenderedInlineMath math={row.from} />
            </span>
            <span className="text-muted-foreground">-&gt;</span>
            <span className="text-primary">
              <RenderedInlineMath math={row.to} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}


function ServerStatus() {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-[#78dc86]" aria-hidden="true" />
          <h3 className="text-lg font-semibold">Estado FastAPI</h3>
        </div>
        <span className="rounded-full border border-[#357a48] bg-[#153421] px-3 py-1 font-mono text-xs uppercase text-[#78dc86]">
          Local
        </span>
      </div>
      <div className="grid gap-3">
        <StatusMetric label="Proxy" value="/api" tone="primary" />
        <StatusMetric label="Render" value="KaTeX" tone="success" />
        <StatusMetric label="Motor" value="SymPy" tone="accent" />
      </div>
    </section>
  );
}


function StatusMetric({ label, value, tone }: { label: string; value: string; tone: "primary" | "success" | "accent" }) {
  const toneClass = {
    primary: "text-primary",
    success: "text-[#78dc86]",
    accent: "text-accent",
  }[tone];

  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-[#0d1117] px-3 py-2">
      <span className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <span className={["font-mono text-sm", toneClass].join(" ")}>{value}</span>
    </div>
  );
}


function RenderedBlockMath({ math }: { math: string }) {
  const normalizedMath = normalizeLatexMath(math);

  return (
    <BlockMath
      math={normalizedMath}
      errorColor="#ff6b6b"
      renderError={() => <code className="break-words font-mono text-sm text-error">{math}</code>}
    />
  );
}


function RenderedInlineMath({ math }: { math: string }) {
  const normalizedMath = normalizeLatexMath(math);

  return (
    <InlineMath
      math={normalizedMath}
      errorColor="#ff6b6b"
      renderError={() => <code className="break-words font-mono text-sm text-error">{math}</code>}
    />
  );
}


function ResultPanel({ result }: { result: SolverResult }) {
  const steps = getSteps(result);

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-[#78dc86]" aria-hidden="true" />
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Resultado calculado</p>
              <h2 className="mt-1 text-2xl font-semibold">{resultTitle(result.mode)}</h2>
            </div>
          </div>
          <span className="rounded-full border border-[#357a48] bg-[#153421] px-3 py-1 font-mono text-xs uppercase text-[#78dc86]">
            Solution found
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-primary/40 bg-[#0d1117] p-4 shadow-[0_0_20px_rgba(173,198,255,0.12)]">
          <RenderedBlockMath math={resultEquation(result)} />
        </div>
      </div>

      <ol className="relative space-y-6 before:absolute before:left-4 before:top-3 before:h-[calc(100%-24px)] before:w-px before:bg-border">
        {steps.map((step, index) => {
          const context = stepContext(step);
          return (
            <li key={`${index}-${step.equation}`} className="relative grid gap-4 pl-11 xl:grid-cols-[minmax(0,1fr)_280px]">
              <span className="absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-full border border-primary bg-[#0d1117] font-mono text-xs text-primary">
                {index + 1}
              </span>
              <div className={["rounded-lg border bg-card p-5", index === steps.length - 1 ? "border-[#357a48]" : "border-border"].join(" ")}>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Paso {String(index + 1).padStart(2, "0")}
                </p>
                <p className="mt-3 leading-7 text-foreground">{step.explanation}</p>
                <div className="mt-4 overflow-x-auto rounded-md border border-border bg-[#0d1117] p-4">
                  <RenderedBlockMath math={step.equation} />
                </div>
              </div>
              <aside className="rounded-lg border border-border bg-muted p-5">
                <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-[#78dc86]">
                  <Sigma className="h-4 w-4" aria-hidden="true" />
                  {context.label}
                </p>
                <h3 className="mt-3 font-semibold text-foreground">{context.title}</h3>
                <div className="mt-3 overflow-x-auto text-sm text-muted-foreground">
                  <RenderedBlockMath math={context.formula} />
                </div>
              </aside>
            </li>
          );
        })}
      </ol>
    </section>
  );
}


function EmptyResultState() {
  return (
    <section className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
      <Terminal className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-4 text-xl font-semibold">Listo para calcular</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        El resultado y la resolucion paso a paso apareceran aqui con el formato tecnico de Laplace Engine.
      </p>
    </section>
  );
}


function EmptyPanel({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: typeof History;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-4 text-xl font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
    </section>
  );
}


function InfoCard({
  body,
  icon: Icon,
  title,
}: {
  body: string;
  icon: typeof Calculator;
  title: string;
}) {
  return (
    <article className="rounded-lg border border-border bg-card p-6">
      <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
      <h2 className="mt-4 text-2xl font-semibold">{title}</h2>
      <p className="mt-3 leading-7 text-muted-foreground">{body}</p>
    </article>
  );
}


function EndpointRow({ description, method, path }: { description: string; method: string; path: string }) {
  return (
    <div className="grid gap-3 rounded-md border border-border bg-[#0d1117] p-4 md:grid-cols-[80px_220px_1fr]">
      <span className="text-[#78dc86]">{method}</span>
      <span className="text-primary">{path}</span>
      <span className="text-muted-foreground">{description}</span>
    </div>
  );
}


function DocNote({ text, title }: { text: string; title: string }) {
  return (
    <article className="rounded-lg border border-border bg-[#0d1117] p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </article>
  );
}


function FieldPreview({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <div className="mt-2 rounded-md border border-border bg-[#0d1117] px-3 py-3 font-mono text-sm text-foreground">
        {value}
      </div>
    </div>
  );
}


function SettingOption({ checked = false, text, title }: { checked?: boolean; text: string; title: string }) {
  return (
    <article className="flex gap-4 rounded-lg border border-border bg-[#0d1117] p-4">
      <span
        className={[
          "mt-1 h-4 w-4 shrink-0 rounded-full border",
          checked ? "border-primary bg-primary" : "border-border",
        ].join(" ")}
      />
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
      </div>
    </article>
  );
}


function insertIntoTextarea(
  element: HTMLTextAreaElement | null,
  currentValue: string,
  setValue: (value: string) => void,
  snippet: string,
) {
  if (!element) {
    setValue(currentValue + snippet);
    return;
  }

  const start = element.selectionStart ?? currentValue.length;
  const end = element.selectionEnd ?? currentValue.length;
  const nextValue = currentValue.slice(0, start) + snippet + currentValue.slice(end);
  setValue(nextValue);
  window.requestAnimationFrame(() => {
    element.focus();
    const cursor = start + snippet.length;
    element.setSelectionRange(cursor, cursor);
  });
}


function insertIntoInput(
  element: HTMLInputElement | null,
  currentValue: string,
  setValue: (value: string) => void,
  snippet: string,
) {
  if (!element) {
    setValue(currentValue + snippet);
    return;
  }

  const start = element.selectionStart ?? currentValue.length;
  const end = element.selectionEnd ?? currentValue.length;
  const nextValue = currentValue.slice(0, start) + snippet + currentValue.slice(end);
  setValue(nextValue);
  window.requestAnimationFrame(() => {
    element.focus();
    const cursor = start + snippet.length;
    element.setSelectionRange(cursor, cursor);
  });
}


function viewCopy(view: AppView) {
  const copy: Record<AppView, { description: string; eyebrow: string; title: string }> = {
    workspace: {
      description: "Ingrese una funcion, seleccione el modo y obtenga una resolucion simbolica paso a paso.",
      eyebrow: "LAPLACE.OS / solver",
      title: "Motor Laplace",
    },
    history: {
      description: "Recupera calculos recientes y vuelve a abrir sus resultados sin recalcular.",
      eyebrow: "LAPLACE.OS / history",
      title: "Historial",
    },
    documentation: {
      description: "Consulta la arquitectura funcional, endpoints locales y sintaxis aceptada por el motor.",
      eyebrow: "LAPLACE.OS / docs",
      title: "Documentacion",
    },
    library: {
      description: "Busca formulas y teoremas para cargarlos directamente en el solver.",
      eyebrow: "LAPLACE.OS / calculus-ref",
      title: "Tablas y Teoremas",
    },
    settings: {
      description: "Verifica la conexion con FastAPI y revisa parametros del motor simbolico.",
      eyebrow: "LAPLACE.OS / api",
      title: "Configuracion de API",
    },
  };
  return copy[view];
}


function modeTitle(mode: TransformMode) {
  if (mode === "direct") {
    return "Transformada directa";
  }
  if (mode === "inverse") {
    return "Transformada inversa";
  }
  return "Resolucion de EDO por Laplace";
}


function activeFieldLabel(field: ActiveField) {
  const labels: Record<ActiveField, string> = {
    direct: "f(t)",
    inverse: "F(s)",
    ode: "EDO",
    y0: "y(0)",
    dy0: "y'(0)",
  };
  return labels[field];
}


function canSubmit(
  mode: TransformMode,
  directExpression: string,
  inverseExpression: string,
  odeEquation: string,
) {
  if (mode === "direct") {
    return directExpression.trim().length > 0;
  }
  if (mode === "inverse") {
    return inverseExpression.trim().length > 0;
  }
  return odeEquation.trim().length > 0;
}


function getSteps(result: SolverResult): LaplaceStep[] {
  return result.result.steps;
}


function normalizeLatexMath(value: string) {
  const math = value.trim();

  if (math.startsWith("$$") && math.endsWith("$$")) {
    return math.slice(2, -2).trim();
  }

  if (math.startsWith("\\[") && math.endsWith("\\]")) {
    return math.slice(2, -2).trim();
  }

  if (math.startsWith("\\(") && math.endsWith("\\)")) {
    return math.slice(2, -2).trim();
  }

  if (math.startsWith("$") && math.endsWith("$")) {
    return math.slice(1, -1).trim();
  }

  return math;
}


function inputPreviewEquation(mode: TransformMode, value: string) {
  const expression = value.trim();

  if (!expression) {
    return "";
  }

  if (looksLikeLatex(expression)) {
    return normalizeLatexMath(expression);
  }

  if (mode === "direct") {
    return `f(t)=${sympyishToLatex(expression)}`;
  }

  if (mode === "inverse") {
    return `F(s)=${sympyishToLatex(expression)}`;
  }

  return sympyishEquationToLatex(expression);
}


function looksLikeLatex(value: string) {
  return /\\[a-zA-Z]+|^\$\$?|^\\\(|^\\\[/.test(value.trim());
}


function sympyishEquationToLatex(value: string) {
  const equalityIndex = value.indexOf("=");

  if (equalityIndex === -1) {
    return sympyishToLatex(value);
  }

  const left = value.slice(0, equalityIndex);
  const right = value.slice(equalityIndex + 1);
  return `${sympyishToLatex(left)}=${sympyishToLatex(right)}`;
}


function sympyishToLatex(value: string): string {
  let latex = value.trim();

  const integralMatch = latex.match(/^Integral\((.+),\s*\(\s*tau\s*,\s*([^,]+),\s*([^)]+)\s*\)\s*\)$/);
  if (integralMatch) {
    const [, integrand, lowerLimit, upperLimit] = integralMatch;
    return `\\int_{${sympyishToLatex(lowerLimit)}}^{${sympyishToLatex(upperLimit)}} ${sympyishToLatex(integrand)}\\,d\\tau`;
  }

  latex = latex.replace(/\s+/g, " ");
  latex = latex.replace(/\bpi\b/g, "\\pi");
  latex = latex.replace(/\btau\b/g, "\\tau");
  latex = latex.replace(/\*\*/g, "^");

  latex = replaceFunctionCalls(latex, "Heaviside", "\\theta");
  latex = replaceFunctionCalls(latex, "sin", "\\sin");
  latex = replaceFunctionCalls(latex, "cos", "\\cos");
  latex = replaceFunctionCalls(latex, "tan", "\\tan");
  latex = replaceFunctionCalls(latex, "sinh", "\\sinh");
  latex = replaceFunctionCalls(latex, "cosh", "\\cosh");
  latex = replaceFunctionCalls(latex, "log", "\\log");
  latex = replaceFunctionCalls(latex, "sqrt", "\\sqrt");
  latex = replaceFunctionCalls(latex, "exp", "e^");

  latex = latex.replace(/([A-Za-z\\]+|\d+|\([^()]+\))\s*\/\s*\(([^()]+)\)/g, "\\frac{$1}{$2}");
  latex = latex.replace(/([A-Za-z\\]+|\d+)\s*\/\s*([A-Za-z\\]+|\d+)/g, "\\frac{$1}{$2}");
  latex = latex.replace(/\^(-?\d+|[A-Za-z\\]+|\([^()]+\))/g, "^{$1}");
  latex = latex.replace(/\s*\*\s*/g, "");

  return latex;
}


function replaceFunctionCalls(value: string, functionName: string, latexName: string) {
  let result = value;
  const pattern = new RegExp(`${functionName}\\(([^()]*)\\)`, "g");

  result = result.replace(pattern, (_match, argument: string) => {
    const renderedArgument = sympyishToLatex(argument);

    if (latexName === "e^") {
      return `e^{${renderedArgument}}`;
    }

    if (latexName === "\\sqrt") {
      return `\\sqrt{${renderedArgument}}`;
    }

    return `${latexName}\\left(${renderedArgument}\\right)`;
  });

  return result;
}


function resultEquation(result: SolverResult) {
  if (result.mode === "direct") {
    return `\\mathcal{L}\\{${result.result.input_latex}\\}=${result.result.transform_latex}`;
  }
  if (result.mode === "inverse") {
    return `\\mathcal{L}^{-1}\\{${result.result.input_latex}\\}=${result.result.result_latex}`;
  }
  return result.result.solution_latex;
}


function resultTitle(mode: TransformMode) {
  if (mode === "direct") {
    return "Dominio de frecuencia F(s)";
  }
  if (mode === "inverse") {
    return "Dominio temporal f(t)";
  }
  return "Solucion del PVI";
}


function submitLabel(mode: TransformMode) {
  if (mode === "direct") {
    return "Calcular F(s)";
  }
  if (mode === "inverse") {
    return "Resolver f(t)";
  }
  return "Resolver PVI";
}


function quickTip(mode: TransformMode) {
  if (mode === "direct") {
    return {
      title: "Funciones de paso",
      description: "Para Heaviside use Heaviside(t-a). El motor aplica desplazamiento en el eje t cuando detecta u(t-a)f(t-a).",
      example: "Heaviside(t-2)*(t-2)",
    };
  }
  if (mode === "inverse") {
    return {
      title: "Fracciones parciales",
      description: "Las expresiones racionales se descomponen para mostrar una inversa por termino cuando el denominador lo permite.",
      example: "(s + 3)/(s**2 + 3*s + 2)",
    };
  }
  return {
    title: "Condiciones iniciales",
    description: "Para EDO de segundo orden, define y(0) y y'(0). La transformada usa esas condiciones para despejar Y(s).",
    example: "y'' + 3*y' + 2*y = 0",
  };
}


function stepContext(step: LaplaceStep) {
  const explanation = step.explanation.toLowerCase();
  if (explanation.includes("traslacion")) {
    return {
      label: "Teorema a aplicar",
      title: "Traslacion",
      formula: "\\mathcal{L}\\{e^{at}f(t)\\}=F(s-a)\\quad / \\quad \\mathcal{L}\\{u(t-a)f(t-a)\\}=e^{-as}F(s)",
    };
  }
  if (explanation.includes("integral")) {
    return {
      label: "Propiedad base",
      title: "Integral acumulada",
      formula: "\\mathcal{L}\\{\\int_0^t f(\\tau)\\,d\\tau\\}=\\frac{F(s)}{s}",
    };
  }
  if (explanation.includes("linealidad") || explanation.includes("suma")) {
    return {
      label: "Propiedad base",
      title: "Linealidad",
      formula: "\\mathcal{L}\\{a f(t)+b g(t)\\}=aF(s)+bG(s)",
    };
  }
  if (explanation.includes("derivada")) {
    return {
      label: "Propiedad base",
      title: "Potencia de t",
      formula: "\\mathcal{L}\\{t^n f(t)\\}=(-1)^n\\frac{d^nF(s)}{ds^n}",
    };
  }
  return {
    label: "Analisis",
    title: "Validacion simbolica",
    formula: "\\text{Continuidad por tramos y orden exponencial.}",
  };
}


function apiStatusColor(status: ApiHealthState["status"]) {
  if (status === "online") {
    return "text-[#78dc86]";
  }
  if (status === "offline") {
    return "text-error";
  }
  if (status === "checking") {
    return "text-primary";
  }
  return "text-muted-foreground";
}


function apiStatusPill(status: ApiHealthState["status"]) {
  if (status === "online") {
    return "border-[#357a48] bg-[#153421] text-[#78dc86]";
  }
  if (status === "offline") {
    return "border-error bg-error/10 text-error";
  }
  if (status === "checking") {
    return "border-primary bg-primary/10 text-primary";
  }
  return "border-border bg-muted text-muted-foreground";
}


function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
