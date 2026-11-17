# EstimadorCFE

> **Enlaces del proyecto**

**Link:** `https://hunabbohorquez.github.io/EstimadorCFE/`

**Repositorio en GitHub:** `https://github.com/HunabBohorquez/EstimadorCFE`

> 📝 **Nota:** este proyecto tiene los **mismos archivos** que el repositorio de GitLab
> (`index.html`, `styles.css`, `app.js`, `README.md`). Solo cambia la plataforma de alojamiento.

---

Simulador de consumo eléctrico bimestral con tarifa escalonada. HTML5 + CSS3 + JavaScript ES6+ puro, sin dependencias.

## Ejecución
1. Guarda `index.html`, `styles.css`, `app.js` y `README.md` en la misma carpeta.
2. Abre `index.html` en un navegador moderno (no requiere servidor).
3. Pulsa **Cargar Hogar Demo** para probar los tres escalones. Los datos y tarifas se guardan en `localStorage`.

## Arquitectura (`app.js`)
| Módulo | Responsabilidad |
|---|---|
| `TariffEngine` | kWh por aparato, validación de tarifas y cálculo del recibo por escalones |
| `ApplianceStore` | CRUD, interruptor activo/inactivo, demo y persistencia |
| `SavingsSimulator` | Compara recibo actual vs. recibo con el equipo reemplazado |
| `ChartRenderer` | Gráfico de barras horizontales en `<canvas>` |

## Fórmulas
- **kWh por aparato** = (Watts × Cantidad × Horas diarias × Días del bimestre) / 1000
- **Escalones** (con tarifas por defecto):
  - Básico: min(kWh, 150) × $1.05
  - Intermedio: (min(kWh, 280) − 150, mínimo 0) × $1.28
  - Excedente: (kWh − 280, mínimo 0) × $3.75
- **Subtotal** = energía de los 3 escalones + cargo fijo ($60.00)
- **IVA** = Subtotal × 16 % (el IVA se aplica también al cargo fijo)
- **Total** = Subtotal + IVA
- Cada importe se redondea a centavos (2 decimales) antes de sumarse.
- **Ahorro**: se recalcula el recibo completo con el consumo nuevo; al bajar el consumo, los kWh se descuentan primero del escalón más caro de forma natural. Ahorro anual = ahorro bimestral × 6 (supone consumo similar en todos los bimestres).

## Pruebas verificables: Hogar Demo

### 1) kWh por equipo
| Equipo | W | Cant. | h/día | Días | Cálculo | kWh |
|---|---|---|---|---|---|---|
| Refrigerador | 150 | 1 | 8 | 60 | 150×1×8×60/1000 | 72.00 |
| Aire acondicionado | 1200 | 1 | 2 | 60 | 1200×1×2×60/1000 | 144.00 |
| Televisión | 100 | 1 | 4 | 60 | 100×1×4×60/1000 | 24.00 |
| Focos LED | 9 | 8 | 5 | 60 | 9×8×5×60/1000 | 21.60 |
| Lavadora | 500 | 1 | 1 | 24 | 500×1×1×24/1000 | 12.00 |
| Computadora | 150 | 1 | 7 | 60 | 150×1×7×60/1000 | 63.00 |

**Total** = 72 + 144 + 24 + 21.6 + 12 + 63 = **336.60 kWh**

### 2) Distribución por escalones
- Básico: 150.00 kWh
- Intermedio: 280 − 150 = 130.00 kWh
- Excedente: 336.60 − 280 = 56.60 kWh

### 3) Cobro por escalón
- Básico: 150 × 1.05 = **$157.50**
- Intermedio: 130 × 1.28 = **$166.40**
- Excedente: 56.6 × 3.75 = **$212.25**
- Energía: 157.50 + 166.40 + 212.25 = **$536.15**

### 4) Cargo fijo, IVA y total
- Subtotal: 536.15 + 60.00 = **$596.15**
- IVA 16 %: 596.15 × 0.16 = 95.384 → **$95.38**
- **TOTAL A PAGAR: 596.15 + 95.38 = $691.53 MXN**

### 5) Simulador: cambiar el aire acondicionado de 1200 W a 600 W
- Equipo nuevo: 600×1×2×60/1000 = 72.00 kWh → ahorro de **72.00 kWh** bimestrales
- Consumo nuevo: 336.60 − 72 = 264.60 kWh
  - Básico 150 × 1.05 = 157.50
  - Intermedio (264.6 − 150 = 114.6) × 1.28 = 146.688 → 146.69
  - Excedente: 0 kWh → $0.00 (los 56.60 kWh del Excedente desaparecen primero; los 15.40 restantes salen del Intermedio)
- Subtotal: 157.50 + 146.69 + 60.00 = 364.19; IVA: 364.19 × 0.16 = 58.2704 → 58.27; Total: **$422.46**
- **Ahorro bimestral: 691.53 − 422.46 = $269.07**
- **Ahorro anual: 72 × 6 = 432.00 kWh y 269.07 × 6 = $1,614.42**

### 6) Cómo comprobarlo
1. Pulsa **Cargar Hogar Demo** y compara kWh, desglose y total con las tablas anteriores.
2. En el simulador elige "Aire acondicionado (1200 W)" e ingresa `600`; debes ver $269.07 bimestral y $1,614.42 anual.
3. Apaga un interruptor: el consumo, el desglose y el gráfico se recalculan al instante.

## Exportación
El botón **Exportar reporte JSON** descarga `reporte-estimadorcfe.json` con tarifas, aparatos (con su kWh), total de kWh y el recibo completo.
