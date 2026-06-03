# Guia paso a paso del proyecto

## 1. Que es este proyecto

Es una aplicacion web para resolver Transformadas de Laplace.

Tiene dos partes:

```text
Frontend: la pantalla que ve el usuario.
Backend: la API que calcula con SymPy.
```

La pantalla corre en:

```text
http://127.0.0.1:5173
```

La API corre en:

```text
http://127.0.0.1:8000
```

## 2. Como funciona cuando presionas Calcular

Flujo completo:

```text
1. Escribes una funcion en la caja f(t).
2. React guarda ese texto.
3. Al presionar Calcular, React Query ejecuta una peticion HTTP.
4. El frontend llama a /api/laplace/direct.
5. Vite redirige /api hacia el backend FastAPI.
6. FastAPI recibe el texto.
7. SymPy convierte el texto en expresion matematica.
8. SymPy calcula la transformada de Laplace.
9. El backend crea pasos con explicacion y LaTeX.
10. El frontend recibe el JSON.
11. KaTeX renderiza las formulas en pantalla.
```

## 3. Estructura general

```text
backend/
  app/
    main.py
    core/config.py
    routers/laplace.py
    schemas/laplace.py
    services/laplace_direct.py
  requirements.txt

frontend/
  src/
    App.tsx
    main.tsx
    features/laplace/
      api/laplace-api.ts
      components/LaplaceDirectTutor.tsx
      types.ts
    components/ui/
    lib/
  vite.config.ts
  package.json
```

## 4. Backend: que hace cada archivo

### `backend/app/main.py`

Es la entrada principal de FastAPI.

Hace tres cosas:

```text
1. Crea la app.
2. Configura CORS.
3. Registra las rutas de Laplace.
```

Tambien tiene:

```text
GET /health
```

Sirve para saber si el backend esta vivo.

### `backend/app/core/config.py`

Guarda configuracion general, por ejemplo que origenes del frontend pueden llamar al backend.

Permite:

```text
http://localhost:5173
http://127.0.0.1:5173
```

### `backend/app/routers/laplace.py`

Define el endpoint:

```text
POST /laplace/direct
```

Este archivo no hace matematica profunda. Solo recibe la solicitud y llama al servicio.

### `backend/app/schemas/laplace.py`

Define el formato del JSON.

Entrada:

```json
{
  "function": "t**2"
}
```

Salida:

```json
{
  "input_latex": "t^{2}",
  "transform_latex": "\\frac{2}{s^{3}}",
  "convergence_latex": null,
  "steps": []
}
```

### `backend/app/services/laplace_direct.py`

Es el archivo mas importante del backend.

Hace esto:

```text
1. Recibe el texto de la funcion.
2. Valida que solo dependa de t.
3. Rechaza expresiones peligrosas o no soportadas.
4. Usa SymPy para calcular la transformada.
5. Construye los pasos.
6. Devuelve LaTeX puro.
```

## 5. Frontend: que hace cada archivo

### `frontend/src/main.tsx`

Arranca React y monta la app en el navegador.

### `frontend/src/App.tsx`

Coloca el proveedor de React Query y muestra el componente principal.

### `frontend/src/features/laplace/components/LaplaceDirectTutor.tsx`

Es la pantalla principal.

Hace esto:

```text
1. Muestra la caja f(t).
2. Guarda lo que escribes.
3. Tiene el boton Calcular.
4. Muestra estado de carga.
5. Muestra errores.
6. Muestra resultado y pasos.
```

### `frontend/src/features/laplace/api/laplace-api.ts`

Hace la llamada HTTP.

Actualmente llama a:

```text
/api/laplace/direct
```

No llama directo a `8000`. Vite se encarga de redirigir la peticion al backend.

### `frontend/vite.config.ts`

Define la direccion del frontend:

```text
host: 127.0.0.1
port: 5173
```

Tambien define el proxy:

```text
/api -> http://127.0.0.1:8000
```

Eso evita errores como `Failed to fetch`.

## 6. Como iniciar el proyecto

Necesitas dos terminales.

### Terminal 1: Backend

```powershell
cd C:\Users\willi\Documents\Codex\2026-06-02\contexto-del-proyecto-act-o-como\backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

Debe mostrar algo parecido a:

```text
Uvicorn running on http://127.0.0.1:8000
```

### Terminal 2: Frontend

```powershell
cd C:\Users\willi\Documents\Codex\2026-06-02\contexto-del-proyecto-act-o-como\frontend
npm.cmd run dev
```

Debe mostrar algo parecido a:

```text
Local: http://127.0.0.1:5173/
```

Despues abres:

```text
http://127.0.0.1:5173
```

## 7. Como saber si se cayo un servicio

### Si se cae el frontend

No abre:

```text
http://127.0.0.1:5173
```

El navegador puede mostrar:

```text
No se puede acceder a este sitio
ERR_CONNECTION_REFUSED
```

Solucion:

```powershell
cd C:\Users\willi\Documents\Codex\2026-06-02\contexto-del-proyecto-act-o-como\frontend
npm.cmd run dev
```

### Si se cae el backend

La pantalla abre, pero al calcular puede mostrar:

```text
Failed to fetch
```

Prueba esta direccion:

```text
http://127.0.0.1:8000/health
```

Si no muestra:

```json
{"status":"ok"}
```

entonces el backend esta caido.

Solucion:

```powershell
cd C:\Users\willi\Documents\Codex\2026-06-02\contexto-del-proyecto-act-o-como\backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

## 8. Como probar que todo funciona

En la app, escribe:

```text
t**2
```

Presiona Calcular.

Debe aparecer algo equivalente a:

```text
2 / s^3
```

Luego prueba:

```text
exp(-2*t)*sin(3*t)
```

Y:

```text
3*t + cos(4*t)
```

## 9. Errores comunes

### Error: Failed to fetch

Significa que el frontend no pudo llegar al backend.

Revisar:

```text
1. Backend encendido.
2. Frontend encendido.
3. Abrir http://127.0.0.1:8000/health.
4. Recargar la pantalla con Ctrl + Shift + R.
```

### Error por expresion invalida

Usa sintaxis tipo Python/SymPy.

Correcto:

```text
t**2
sin(t)
cos(4*t)
exp(-2*t)
```

Incorrecto:

```text
f(t)=t**2
sen(t)
e^(-2t)
\sin(t)
```

## 10. Como se implemento

Primero se creo el backend con FastAPI.

Despues se separo en capas:

```text
router -> recibe HTTP
schema -> define JSON
service -> hace matematica
```

Luego se creo el frontend con React, TypeScript y Vite.

Despues se agrego:

```text
React Query -> manejar carga/error/exito
react-katex -> renderizar LaTeX
Tailwind -> estilos
shadcn/ui -> componentes base
```

Finalmente se conecto frontend con backend usando:

```text
/api/laplace/direct
```

con proxy de Vite hacia:

```text
http://127.0.0.1:8000
```

## 11. Que sigue despues

La siguiente fase natural seria agregar:

```text
1. Transformada inversa: /laplace/inverse
2. Resolucion de EDOs: /laplace/ode
3. Mas validaciones pedagogicas
4. Mas ejemplos en la interfaz
5. Pruebas automaticas completas
```
