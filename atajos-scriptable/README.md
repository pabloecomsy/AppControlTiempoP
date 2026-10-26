# TiempoP sin Xcode: Atajos + Scriptable

Mide cuánto tiempo llevas hoy en **Instagram, Facebook y Chrome** y lo muestra en un widget de la pantalla de bloqueo y de la de inicio. Se reinicia a las 12:00 am. No necesita Mac, cuenta de desarrollador ni pagar nada.

**Cómo funciona.** Atajos tiene automatizaciones "cuando se abre X app" y "cuando se cierra X app". Cada una llama a un script de Scriptable que anota la hora. El widget (otro script de Scriptable) suma los minutos del día y los dibuja. Si una app está abierta en ese momento, el widget incluye la sesión en curso.

Todo se configura **en el iPhone**, unos 15 minutos.

---

## Paso 1. Instalar Scriptable

App Store → busca **Scriptable** (de Simon Støvring, gratis) → instalar. Ábrela una vez.

## Paso 2. Meter los dos scripts

La forma más cómoda es con un atajo que los descarga solo:

1. Abre **Atajos** → pestaña Atajos → **+** → nombre "Instalar TiempoP".
2. Agrega la acción **Obtener contenido de URL** con esta dirección:
   `https://raw.githubusercontent.com/pabloecomsy/AppControlTiempoP/claude/vibrant-newton-uj9hl3/atajos-scriptable/TiempoP%20Registro.js`
3. Agrega **Guardar archivo** → activa "Preguntar dónde guardar" desactivado, servicio **iCloud Drive**, ruta `Scriptable/TiempoP Registro.js`, sobrescribir activado.
4. Repite 2 y 3 con la segunda URL y ruta `Scriptable/TiempoP Widget.js`:
   `https://raw.githubusercontent.com/pabloecomsy/AppControlTiempoP/claude/vibrant-newton-uj9hl3/atajos-scriptable/TiempoP%20Widget.js`
5. Ejecuta el atajo. Abre Scriptable: deben aparecer **TiempoP Registro** y **TiempoP Widget**.

Si Scriptable no tiene iCloud activado (Ajustes de Scriptable › iCloud), la alternativa es abrir cada URL en Safari, seleccionar todo, copiar, y en Scriptable **+** → pegar → nombrar el script exactamente igual.

## Paso 3. Crear las 6 automatizaciones

En **Atajos** → pestaña **Automatización** → **+** (o "Nueva automatización") → **App**.

Haz esto para cada combinación de la tabla (6 en total):

| App | Evento | Parámetro |
|---|---|---|
| Instagram | Se abre | `instagram abrir` |
| Instagram | Se cierra | `instagram cerrar` |
| Facebook | Se abre | `facebook abrir` |
| Facebook | Se cierra | `facebook cerrar` |
| Chrome | Se abre | `chrome abrir` |
| Chrome | Se cierra | `chrome cerrar` |

Para cada una:

1. **App** → Elegir → marca la app. Marca solo **"Se abre"** o solo **"Se cierra"** (no las dos).
2. Elige **Ejecutar inmediatamente** y desactiva **Notificar al ejecutar**. Siguiente.
3. Acción: busca **Scriptable** → **Ejecutar script** (Run Script).
   - Script: **TiempoP Registro**.
   - Toca la flecha para ver más opciones → en **Parámetro** escribe el texto de la tabla (por ejemplo `instagram abrir`).
   - Deja **Ejecutar en app** desactivado.
4. Listo.

Comprobación rápida: abre Instagram, espera 10 segundos, ciérrala (vuelve al inicio). Abre Scriptable y toca **TiempoP Registro**: debe mostrar "instagram: 0 min" con la sesión registrada. Tras un minuto de uso aparecerá "1 min".

## Paso 4. Poner el widget

**Pantalla de bloqueo:** mantén presionada la pantalla de bloqueo → **Personalizar** → **Pantalla de bloqueo** → toca el área bajo la hora → busca **Scriptable** → elige el **rectangular** → tócalo → Script: **TiempoP Widget**. Opcional: el **circular** (anillo de Instagram vs meta) y el **en línea** sobre la hora (IG · FB · Chr).

**Pantalla de inicio:** mantén presionada → **Editar** → **Agregar widget** → **Scriptable** → **mediano** → tócalo → Script: **TiempoP Widget**. Es el diseño del boceto: tres filas con icono, barra y tiempo, y el total a la derecha.

## Widget "sin redes"

Agrega otro widget de Scriptable con el script **TiempoP Widget** y en **Parameter** escribe `sin redes`.

- **Pantalla de bloqueo, rectangular:** "Llevas sin redes" con un contador en vivo desde la última vez que cerraste Instagram, Facebook o Chrome, y abajo el récord del día.
- **Pantalla de inicio, pequeño o mediano:** "Mayor tiempo sin redes hoy" en grande y, abajo, cuánto llevas ahora.
- **Circular y en línea:** la racha actual en corto.

El récord del día es el mayor hueco entre dos usos de esas apps, contando desde el primer uso del día, más el hueco actual si ahora no estás en ninguna. La noche no cuenta como récord del día anterior. iOS no permite a Atajos saber cuándo desbloqueas el teléfono, así que mide tiempo sin redes, no tiempo sin tocar el iPhone.

Otros parámetros del widget: `instagram`, `facebook chrome`, `ig fb`… para mostrar menos apps con números más grandes.

## Metas y colores

En **TiempoP Widget**, arriba del todo, está `GOALS` con los minutos por app (30, 30, 60). Las barras van verde → naranja (60 %) → rojo (100 %). Cámbialos a tu gusto.

## Qué esperar

- **Precisión:** la de las automatizaciones de iOS. "Se cierra" dispara al salir de la app o bloquear el teléfono; a veces tarda unos segundos. Si iOS pierde un cierre, la sesión se corta sola a 3 horas y se cierra al siguiente "se abre".
- **Refresco del widget:** iOS lo redibuja cada pocos minutos, según su presupuesto. El tiempo mostrado puede ir unos minutos atrás. El mediano indica "en uso ahora" o "hace X min".
- **Reset:** automático a las 00:00 por fecha; no hace falta otra automatización.
- **Reinstalar Instagram:** las automatizaciones siguen ligadas a la app; nada se pierde.
- **Instagram desde Chrome:** cuenta como Chrome.
- **Total del iPhone:** no se puede medir por esta vía. Si lo quieres, agrega al lado el widget nativo **Tiempo en pantalla** de iOS.

## Archivos

- `TiempoP Registro.js`: lo llaman las automatizaciones. Guarda `tiempop.json` dentro de Scriptable con los segundos por app, las sesiones abiertas y 30 días de historial. Abierto a mano muestra el resumen y permite reiniciar el día.
- `TiempoP Widget.js`: el widget. Solo lee.
