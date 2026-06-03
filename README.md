# Calculadora y Tutor de Transformadas de Laplace

Aplicacion web stateless para resolver transformadas de Laplace con pasos pedagogicos.

## Stack

- Backend: Python, FastAPI y SymPy.
- Frontend: React 18, Vite, TypeScript estricto.
- UI: Tailwind CSS y componentes shadcn/ui locales.
- Render matematico: react-katex.
- Peticiones: TanStack React Query.

## Arquitectura

```text
backend/
  app/
    core/          Configuracion transversal.
    routers/       Endpoints HTTP.
    schemas/       Contratos Pydantic de entrada y salida.
    services/      Reglas de negocio y calculo simbolico con SymPy.
  tests/           Pruebas unitarias del servicio.

frontend/
  src/
    components/ui/ Componentes shadcn/ui locales.
    features/      Modulos funcionales por dominio.
    lib/           Utilidades compartidas y cliente React Query.
```

## Backend

Ejecutar desde `backend/`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Para pruebas de desarrollo:

```powershell
pip install -r requirements-dev.txt
pytest
```

Endpoint principal:

```http
POST /laplace/direct
```

Payload:

```json
{
  "function": "exp(-2*t)*sin(3*t) + t**2"
}
```

Respuesta:

```json
{
  "input_latex": "...",
  "transform_latex": "...",
  "convergence_latex": null,
  "steps": [
    {
      "explanation": "Aplicando la propiedad de Linealidad...",
      "equation": "..."
    }
  ]
}
```

Otros endpoints:

```http
POST /laplace/inverse
POST /laplace/ode
```

Transformada inversa:

```json
{
  "expression": "1/(s+2)"
}
```

EDO por Laplace:

```json
{
  "equation": "y'' + 3*y' + 2*y = 0",
  "initial_conditions": {
    "y(0)": 1,
    "dy0": 0
  }
}
```

Conceptos soportados en backend:

- Definicion formal como integral impropia.
- Validacion de dependencia en `t`, continuidad por tramos y orden exponencial.
- Tabla basica: `1`, `t^n`, `e^{at}`, `sin(kt)`, `cos(kt)`, `sinh(kt)`, `cosh(kt)`.
- Linealidad y extraccion de constantes.
- Traslacion en `s` por factores exponenciales.
- Traslacion en `t` con `Heaviside`.
- Multiplicacion por `t^n` usando derivacion en `s`.
- Transformada de integrales de la forma `Integral(f(tau),(tau,0,t))`.
- Reconocimiento de funciones periodicas cuando SymPy detecta periodo.
- Transformada inversa con fracciones parciales.
- Resolucion de EDOs lineales con coeficientes constantes y condiciones iniciales.
- Error pedagogico para funciones sin transformada ordinaria, por ejemplo `exp(t**2)`.

## Frontend

Ejecutar desde `frontend/`:

```powershell
npm install
npm run dev
```

Si PowerShell bloquea `npm.ps1`, usar `npm.cmd`:

```powershell
npm.cmd install
npm.cmd run dev
```

La pantalla permite resolver:

- Transformada directa.
- Transformada inversa.
- EDOs/PVI por Laplace.

Tambien incluye una paleta de simbolos para insertar expresiones compatibles con SymPy, como:

```text
sin(t)
cos(t)
exp(-2*t)
Heaviside(t-2)
Integral(sin(tau),(tau,0,t))
y'
y''
```

Configurar la URL del backend con:

```text
VITE_API_BASE_URL=/api
```

## Evolucion prevista

1. `/laplace/direct`: transformada directa, ya estructurada.
2. `/laplace/inverse`: fracciones parciales, transformada inversa y retorno a `t`.
3. `/laplace/ode`: transformada de derivadas, condiciones iniciales obligatorias, despeje de `Y(s)` e inversa.
