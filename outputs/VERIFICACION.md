# Verificacion realizada

## Backend

- Se creo `backend/.venv`.
- Se instalaron dependencias Python desde `backend/requirements.txt`.
- Se valido import de FastAPI y rutas registradas:
  - `/health`
  - `/laplace/direct`
- Se valido el servicio simbolico con `exp(-2*t)*sin(3*t) + t**2`.
- Se valido HTTP:
  - `GET http://127.0.0.1:8000/health` respondio `{"status":"ok"}`.
  - `POST http://127.0.0.1:8000/laplace/direct` con `{"function":"t**2"}` respondio transformada `\frac{2}{s^{3}}`.

## Frontend

- Se instalaron dependencias con `npm.cmd install`.
- `npm.cmd run typecheck` paso correctamente.
- `npm.cmd run build` paso correctamente fuera del sandbox.
- `GET http://127.0.0.1:5173` respondio HTML de Vite correctamente.

## Servidores activos

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:8000`
- Documentacion FastAPI: `http://127.0.0.1:8000/docs`

## Nota

La verificacion con el navegador integrado fallo por un problema del runtime del browser en Windows. La verificacion HTTP y de build si fue completada.
