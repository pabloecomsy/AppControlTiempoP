import DeviceActivity
import Foundation

/// Extensión DeviceActivityMonitor.
///
/// iOS la ejecuta en segundo plano (sin abrir la app) en tres momentos:
///  - `intervalDidStart`        → 00:00, empieza el día: se archiva ayer y se pone todo en 0.
///  - `eventDidReachThreshold`  → el uso de un slot cruzó un peldaño de la escalera.
///  - `intervalDidEnd`          → 23:59, termina el día.
///
/// Solo escribe en el App Group y pide a WidgetKit que refresque. Nada más.
/// El tiempo de ejecución disponible es de unos pocos segundos, así que no se
/// hace trabajo pesado aquí.
class MonitorExtension: DeviceActivityMonitor {

    private let store = UsageStore.shared

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        // Se llama una vez por actividad (hay cuatro); rolloverIfNeeded es idempotente.
        store.rolloverIfNeeded()
        store.reloadWidgets()
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        store.reloadWidgets()
    }

    override func eventDidReachThreshold(_ event: DeviceActivityEvent.Name, activity: DeviceActivityName) {
        super.eventDidReachThreshold(event, activity: activity)
        guard let parsed = EventNaming.parse(event.rawValue) else { return }
        store.record(slot: parsed.slot, minutes: parsed.minutes)
        store.reloadWidgets()
    }
}
