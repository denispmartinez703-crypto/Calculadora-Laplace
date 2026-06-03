# Implementacion avanzada de teoria de Laplace

Se amplio el backend para cubrir los conceptos solicitados.

## Endpoints

```text
POST /laplace/direct
POST /laplace/inverse
POST /laplace/ode
```

## Transformada directa

Archivo:

```text
backend/app/services/laplace_direct.py
```

Implementa:

- Definicion formal como integral impropia.
- Validacion de variable `t`.
- Validacion de continuidad por tramos.
- Validacion heuristica de orden exponencial.
- Rechazo pedagogico de `exp(t**2)`.
- Linealidad.
- Extraccion de constantes.
- Tabla basica: `1`, `t^n`, `exp(a*t)`, `sin(k*t)`, `cos(k*t)`, `sinh(k*t)`, `cosh(k*t)`.
- Primer teorema de traslacion en `s`.
- Segundo teorema de traslacion en `t` con `Heaviside`.
- Propiedad de multiplicacion por `t^n`.
- Transformada de integrales `Integral(f(tau),(tau,0,t))`.
- Reconocimiento de periodicidad cuando SymPy puede detectar el periodo.

## Transformada inversa

Archivo:

```text
backend/app/services/laplace_inverse.py
```

Implementa:

- Validacion de que la entrada dependa solo de `s`.
- Descomposicion en fracciones parciales con `sympy.apart`.
- Aplicacion de transformada inversa termino a termino.
- Salida en dominio `t`.

Ejemplo:

```json
{
  "expression": "1/(s+2)"
}
```

## EDOs por Laplace

Archivo:

```text
backend/app/services/laplace_ode.py
```

Implementa:

- EDOs lineales con coeficientes constantes.
- Notacion compacta `y'` y `y''`.
- Notacion explicita `Derivative(y(t), t)` y `Derivative(y(t), t, 2)`.
- Condiciones iniciales obligatorias.
- Formula de derivadas:

```text
L{y''} = s^2Y(s) - s y(0) - y'(0)
```

Ejemplo:

```json
{
  "equation": "y'' + 3*y' + 2*y = 0",
  "initial_conditions": {
    "y(0)": 1,
    "dy0": 0
  }
}
```

## Validacion

Pruebas ejecutadas:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests
```

Resultado:

```text
8 passed
```

Tambien se validaron por HTTP:

```text
POST http://127.0.0.1:8000/laplace/direct
POST http://127.0.0.1:8000/laplace/inverse
POST http://127.0.0.1:8000/laplace/ode
```
