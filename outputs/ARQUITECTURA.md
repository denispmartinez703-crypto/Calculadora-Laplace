# Arquitectura propuesta e implementada

Se creo una base de proyecto separada en backend y frontend.

## Backend

```text
backend/app/main.py
backend/app/core/config.py
backend/app/routers/laplace.py
backend/app/schemas/laplace.py
backend/app/services/laplace_direct.py
backend/tests/test_laplace_direct.py
backend/requirements.txt
```

Responsabilidades:

- `main.py`: crea FastAPI, CORS y registra routers.
- `routers/laplace.py`: expone `POST /laplace/direct` y traduce errores de dominio a HTTP 422.
- `schemas/laplace.py`: define el JSON de entrada y salida.
- `services/laplace_direct.py`: concentra parsing, validacion de dominio, calculo con SymPy y pasos LaTeX.

## Frontend

```text
frontend/src/App.tsx
frontend/src/features/laplace/api/laplace-api.ts
frontend/src/features/laplace/components/LaplaceDirectTutor.tsx
frontend/src/features/laplace/types.ts
frontend/src/components/ui/*.tsx
frontend/src/lib/query-client.ts
frontend/src/lib/utils.ts
```

Responsabilidades:

- `LaplaceDirectTutor.tsx`: pantalla principal de calculo directo.
- `laplace-api.ts`: cliente HTTP tipado para `POST /laplace/direct`.
- `types.ts`: contrato TypeScript equivalente al JSON del backend.
- `components/ui`: componentes shadcn/ui locales.
- `query-client.ts`: configuracion central de TanStack React Query.

## Comandos

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

## Decision clave

El backend no devuelve HTML ni KaTeX renderizado. Devuelve LaTeX puro dentro de JSON. El frontend es responsable de renderizarlo con `react-katex`.
