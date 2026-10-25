# Arquitectura de TiempoP

## 1. El problema real

El objetivo es ver, **en la pantalla de bloqueo y sin desbloquear**, cuánto tiempo llevo hoy en Instagram, Facebook, el navegador y el iPhone. Es un ejercicio de conciencia: el dato tiene que estar ahí *antes* de tomar el teléfono.

En iOS ninguna app puede leer el tiempo de uso de otras apps por su cuenta. La única vía legítima es la **Screen Time API** (frameworks `FamilyControls`, `DeviceActivity` y `ManagedSettings`), disponible desde iOS 16 para uso individual (sin Family Sharing, sin cuentas). Toda la arquitectura se desprende de las restricciones de esa API.

## 2. Las tres restricciones que dictan el diseño

| Restricción de iOS | Consecuencia |
|---|---|
| El reporte exacto (`DeviceActivityReport`) solo se renderiza dentro de la app, en una extensión aislada que **no puede escribir a disco compartido ni aparecer en widgets**. | El widget no puede usar el reporte oficial. Hay que obtener los números por otro camino. |
| La extensión `DeviceActivityMonitor` sí puede escribir al App Group, pero iOS solo la despierta en eventos: **inicio/fin de intervalo** y **umbral alcanzado**. | El widget se alimenta de umbrales, no de una lectura continua. |
| Los widgets no ejecutan código en segundo plano; solo muestran una línea de tiempo que alguien más les pide recargar. | El monitor debe pedir la recarga del widget cada vez que escribe. |

## 3. Solución: escalera de umbrales

Para cada métrica («slot») se registra una actividad en `DeviceActivityCenter` con:

- **Horario** diario 00:00 → 23:59, `repeats: true`.
- **Eventos**: uno por peldaño, `instagram.1`, `instagram.2`, … `instagram.15`, `instagram.20`, … cada uno con `threshold` = esos minutos sobre la selección de apps/sitios del slot.

Cuando el uso acumulado del día cruza un peldaño, iOS despierta la extensión de monitoreo con `eventDidReachThreshold("instagram.15")`. La extensión guarda `minutos[instagram] = max(actual, 15)` en el App Group y llama a `WidgetCenter.reloadAllTimelines()`.

Por qué una escalera y no un solo evento que se reprograma: la escalera es **sin estado**. Si iOS pierde o retrasa un aviso, el siguiente peldaño lo corrige; si se reinicia el teléfono, nada se descoordina. Un evento que se reprograma a sí mismo dentro de la extensión depende de que cada paso funcione.

### Densidad

La resolución es fina donde importa (los primeros minutos, cuando aún se puede decidir no entrar) y se abre después:

| Slot | Peldaños | Eventos |
|---|---|---|
| Instagram / Facebook / Navegador | 1…15 cada 1 · 20…60 cada 5 · 75…180 cada 15 · 210…480 cada 30 | 42 c/u |
| iPhone (total) | 10…120 cada 10 · 150…480 cada 30 · 540…1080 cada 60 | 34 |

Total ≈ 160 eventos repartidos en 4 actividades. Apple no documenta un máximo de eventos; si `startMonitoring` lo rechaza, `MonitoringManager` reintenta con las densidades *media* y *gruesa* y guarda cuál aceptó para mostrarlo en la app.

### Recalibración

Si el monitoreo arranca a media tarde, iOS dispara de inmediato todos los umbrales ya superados ese día. Eso convierte «Recalibrar» en un botón barato: borra el día, re-registra y en segundos el widget se reconstruye.

## 4. Reset a las 12:00 am (doble seguro)

1. **Activo:** con `repeats: true`, iOS llama a `intervalDidStart` a las 00:00. La extensión archiva el día anterior en el historial y escribe un día vacío.
2. **Pasivo:** cada `DailyUsage` lleva `dayKey` (`yyyy-MM-dd` local). El widget y la app solo muestran minutos si `dayKey == hoy`; si iOS retrasa el aviso, igual se ve 0. Además la línea de tiempo del widget incluye una entrada en 0 programada a medianoche.

## 5. Instagram borrada y reinstalada

La selección de apps se guarda como `FamilyActivitySelection` (Codable) en el App Group. Sus tokens son opacos pero identifican a la app por su identidad (bundle id), no por la instalación, y el conteo lo lleva el propio Tiempo en pantalla del sistema. Reinstalar no cambia ninguna de las dos cosas. Si alguna vez dejara de contar, basta con volver a elegir la app en «Apps y metas».

Extra: en el selector se puede agregar el sitio `instagram.com` al slot de Instagram, de modo que entrar desde Safari también suma ahí.

## 6. Procesos y responsabilidad de cada uno

```
┌─────────────────────┐   configura    ┌─────────────────────────┐
│  App TiempoP        │──────────────▶ │  DeviceActivityCenter   │ (iOS)
│  · autorización     │                │  4 actividades,         │
│  · selector de apps │                │  ~160 umbrales          │
│  · vista "Hoy"      │                └───────────┬─────────────┘
└─────────┬───────────┘                            │ despierta en cada umbral / 00:00
          │ lee                                    ▼
          │                            ┌─────────────────────────┐
          │                            │  Ext. TiempoPMonitor    │
          │                            │  record(slot, minutos)  │
          │                            │  rollover a medianoche  │
          │                            └───────────┬─────────────┘
          │                                        │ escribe + reloadAllTimelines()
          ▼                                        ▼
┌──────────────────────────────────────────────────────────────────┐
│  App Group  (UserDefaults compartido)                            │
│  usage.today {dayKey, minutes, updatedAt} · history · goals      │
└───────────────────────────────┬──────────────────────────────────┘
                                │ solo lee
                                ▼
                    ┌─────────────────────────┐
                    │  Ext. TiempoPWidget     │
                    │  Lock: rect/circ/inline │
                    │  Home: small/medium     │
                    └─────────────────────────┘
```

- **App**: única con UI completa. Pide la autorización `.individual` una sola vez (sin cuentas), muestra el `FamilyActivityPicker` por slot, registra el monitoreo y muestra el mismo dato que el widget más historial de 30 días.
- **Monitor**: ~30 líneas. Solo escribe y recarga. Tiene segundos de ejecución; no hace nada más.
- **Widget**: solo lee. Nunca calcula uso.
- **Shared/**: modelo, store, escalera y estilos compilados en los tres targets para que los tres cuenten exactamente la misma historia.

## 7. Diseño del widget

Del boceto: un bloque grande con tres iconos circulares a la izquierda, una línea por app y texto a la derecha.

- **Lock Screen rectangular** (≈157×72 pt, el espacio real bajo el reloj): cuadrícula 2×2 con icono + tiempo para IG, FB, Web y Total, y una barra fina de Instagram contra su meta. Es el que cumple «verlo antes de tomar el teléfono».
- **Lock Screen circular**: gauge de Instagram vs meta.
- **Lock Screen inline**: `IG 1h12 · FB 23m · 📱 3h05` encima de la hora.
- **Home medium**: el boceto literal. Tres filas (icono circular, nombre, barra, tiempo) y a la derecha el total del iPhone en grande con la meta y «hace X min».
- **Home small / StandBy**: total grande + barras de IG y FB.

Semáforo uso/meta compartido: verde < 60 %, naranja 60–99 %, rojo ≥ 100 %. Las metas solo colorean; no bloquean nada (eso sería fase 2 con `ManagedSettings`).

## 8. Lo que queda fuera a propósito (fase 2)

- **Reporte exacto dentro de la app** con una extensión `DeviceActivityReport`: daría los minutos precisos en la app (no en el widget). Cuarto target; vale la pena si la escalera se queda corta.
- **Bloqueo suave** al superar la meta (`ManagedSettings.shield`).
- **Notificación** al cruzar la meta (la extensión de monitoreo puede programar una `UNNotificationRequest`).
- Gráfica semanal con el historial que ya se guarda.

## 9. Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| iOS retrasa los avisos de umbral (minutos). | Aceptado: el dato es «mínimo garantizado». Se muestra «hace X min». |
| Límite no documentado de eventos por actividad. | Reintento automático con escaleras más gruesas. |
| `intervalDidStart` no llega a las 00:00. | `dayKey` + entrada a medianoche en el widget. |
| Entitlement de distribución. | Para uso personal, instalación directa desde Xcode. Para TestFlight hay que pedirlo a Apple. |
| El simulador no soporta Screen Time API. | Probar siempre en iPhone real. |
