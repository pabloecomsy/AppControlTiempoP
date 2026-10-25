# TiempoP

Widget para iPhone que muestra, **sin abrir la app ni iniciar sesión**, cuánto tiempo llevas hoy en:

- Instagram (aunque la borres y la reinstales)
- Facebook
- el navegador
- el iPhone en total

Todo se reinicia a las 12:00 am. No hay cuentas, servidores ni internet: todo vive en tu iPhone.

El diseño y las decisiones técnicas están en [`ARQUITECTURA.md`](ARQUITECTURA.md). Léelo primero: explica por qué está construido así y cuáles son los límites reales de iOS.

## Requisitos

- Mac con **Xcode 15 o superior**.
- iPhone con **iOS 17 o superior**. La Screen Time API no funciona en el simulador: hay que probar en el iPhone real.
- Cuenta de Apple Developer. La gratuita sirve para instalar en tu propio iPhone (la app caduca a los 7 días y hay que reinstalar); la de pago (99 USD/año) dura un año.
- Tiempo en pantalla activado en Ajustes.
- [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`.

## Generar el proyecto

1. Edita `project.yml`:
   - Cambia `bundleIdPrefix` y los tres `PRODUCT_BUNDLE_IDENTIFIER` (app, `.monitor`, `.widget`) a un prefijo tuyo.
   - Cambia el App Group `group.com.ecomsy.tiempop` en los tres targets.
2. Pon **el mismo** App Group en `Shared/AppGroup.swift`.
3. Genera y abre:

   ```bash
   xcodegen generate
   open TiempoP.xcodeproj
   ```

4. En Xcode, para **cada uno de los tres targets** (TiempoP, TiempoPMonitor, TiempoPWidget): Signing & Capabilities → elige tu Team. Xcode crea los provisioning profiles con *Family Controls (Development)* y el App Group automáticamente.
5. Conecta el iPhone, selecciona el esquema `TiempoP` y ▶︎ Run.

## Primer uso en el iPhone

1. **Autorizar Tiempo en pantalla.** Aparece un diálogo del sistema; acepta. Se hace una sola vez.
2. **Elegir qué medir.** Para cada fila se abre el selector de apps del sistema:
   - Instagram → marca la app. En la pestaña de sitios web agrega también `instagram.com` para que cuente cuando entras desde Safari.
   - Facebook → marca la app (y `facebook.com` si quieres).
   - Navegador → marca Safari y/o Chrome.
   - iPhone → marca **«Todas las apps y categorías»** (primera fila del selector).
3. **Activar monitoreo.** Si lo activas a media tarde, iOS reporta en segundos lo que ya llevas hoy.
4. **Agregar el widget:**
   - Pantalla de bloqueo: mantén presionada → Personalizar → Pantalla de bloqueo → toca el área bajo la hora → TiempoP → widget rectangular (4 métricas) o circular (Instagram vs meta).
   - Pantalla de inicio: mantén presionada → Editar → Agregar widget → TiempoP → tamaño mediano (el diseño del boceto: barras por app y total a la derecha).

## Cómo funciona en una frase

Una extensión en segundo plano registra en iOS avisos del tipo «dime cuando Instagram llegue a 1, 2, 3 … minutos hoy»; cada aviso escribe el valor en un contenedor compartido y el widget lo lee. A las 00:00 iOS avisa que empezó el día y todo vuelve a 0.

## Qué esperar (límites honestos)

- **Resolución:** 1 minuto los primeros 15 min de cada app, 5 min hasta la hora, 15 min hasta las 3 h, luego 30 min. Para el total del iPhone: 10 min hasta 2 h, 30 min hasta 8 h. El widget muestra el último peldaño alcanzado, es decir, un mínimo garantizado.
- **Latencia:** iOS puede tardar de segundos a un par de minutos en reportar un umbral; el widget no es en tiempo real.
- **Límite de eventos:** si iOS rechaza la cantidad de avisos, la app reintenta sola con una escalera más gruesa y lo indica en la vista «Hoy».
- **Distribución:** instalar desde Xcode en tu propio iPhone funciona de inmediato. Para TestFlight o App Store hay que pedir a Apple el entitlement *Family Controls (Distribution)* (formulario en developer.apple.com).
- **Iconos:** el widget usa símbolos genéricos, no los logos de Instagram/Facebook. Dentro de la app sí se ven los iconos reales de las apps elegidas.

## Estructura

```
project.yml              Definición XcodeGen (3 targets)
Shared/                  Código compilado en los 3 targets
  AppGroup.swift         Identificador del App Group
  Slot.swift             Las 4 métricas (nombre, símbolo, color, meta)
  ThresholdLadder.swift  Escalera de umbrales (1,2,3…15,20…60,75… min)
  EventNaming.swift      "instagram.15" ⇄ (slot, minutos)
  DailyUsage.swift       Modelo del día, con dayKey anti-datos-viejos
  UsageStore.swift       Lectura/escritura en el App Group
  TimeFormat.swift       "1h 12m", "1h12", "1 h 12 min"
  UsageStyle.swift       Semáforo uso/meta, barra, icono
App/                     App SwiftUI: autorizar, elegir apps, activar, vista Hoy
Monitor/                 Extensión DeviceActivityMonitor (escribe los umbrales)
Widget/                  Extensión WidgetKit (solo lee)
```
