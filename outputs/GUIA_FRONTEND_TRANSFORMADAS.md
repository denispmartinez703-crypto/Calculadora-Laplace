# Guia de la nueva pantalla de transformadas

La interfaz ahora permite elegir tres tipos de resolucion:

```text
Directa  -> f(t) hacia F(s)
Inversa  -> F(s) hacia f(t)
EDO      -> problema de valor inicial por Laplace
```

## Direccion de la app

```text
http://127.0.0.1:5173
```

## Como usarla

1. Abre la app.
2. Elige un modo: `Directa`, `Inversa` o `EDO`.
3. Escribe la expresion o usa los botones de la paleta `Simbolos`.
4. Presiona `Resolver`.
5. Revisa el resultado y los pasos.

## Paleta de simbolos

La paleta inserta texto en el campo activo.

Ejemplos:

```text
sin(t)
cos(t)
exp(-2*t)
Heaviside(t-2)
Integral(sin(tau),(tau,0,t))
1/(s+2)
y'
y''
```

## Sintaxis importante

Correcto:

```text
t**2
3*t + cos(4*t)
exp(-2*t)*sin(3*t)
1/(s+2)
y'' + 3*y' + 2*y = 0
```

Incorrecto:

```text
t^2
3t
sen(t)
e^(-2t)
f(t)=t**2
```

## Modos

### Directa

Entrada:

```text
exp(-2*t)*sin(3*t) + t**2
```

Endpoint usado:

```text
/api/laplace/direct
```

### Inversa

Entrada:

```text
1/(s+2)
```

Endpoint usado:

```text
/api/laplace/inverse
```

### EDO

Entrada:

```text
y'' + 3*y' + 2*y = 0
```

Condiciones iniciales:

```text
y(0) = 1
y'(0) = 0
```

Endpoint usado:

```text
/api/laplace/ode
```

## Implementacion

Archivos modificados:

```text
frontend/src/features/laplace/components/LaplaceDirectTutor.tsx
frontend/src/features/laplace/api/laplace-api.ts
frontend/src/features/laplace/types.ts
frontend/src/components/ui/textarea.tsx
```

El frontend usa el proxy de Vite:

```text
/api -> http://127.0.0.1:8000
```

Esto evita errores de CORS y reduce problemas de `Failed to fetch`.
