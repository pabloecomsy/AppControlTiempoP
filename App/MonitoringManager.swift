import DeviceActivity
import FamilyControls
import Foundation

enum MonitoringFailure: LocalizedError {
    case nothingSelected
    case unauthorized
    case system(Error)

    var errorDescription: String? {
        switch self {
        case .nothingSelected:
            return "Selecciona al menos una app antes de activar el monitoreo."
        case .unauthorized:
            return "Falta la autorización de Tiempo en pantalla. Autoriza la app y vuelve a intentar."
        case .system(let error):
            return "iOS rechazó el monitoreo: \(error.localizedDescription)"
        }
    }
}

/// Registra en DeviceActivityCenter una actividad por slot, con horario diario
/// 00:00–23:59 (repetido) y la escalera de umbrales como eventos.
///
/// Si iOS rechaza la cantidad de eventos, reintenta con una escalera más gruesa.
/// Devuelve la densidad que finalmente aceptó.
struct MonitoringManager {
    private let center = DeviceActivityCenter()

    private var allActivityNames: [DeviceActivityName] {
        Slot.allCases.map { DeviceActivityName($0.activityName) }
    }

    /// Horario diario. `repeats: true` hace que `intervalDidStart` se dispare
    /// cada medianoche: ahí se hace el reset a 0.
    private var dailySchedule: DeviceActivitySchedule {
        DeviceActivitySchedule(
            intervalStart: DateComponents(hour: 0, minute: 0, second: 0),
            intervalEnd: DateComponents(hour: 23, minute: 59, second: 59),
            repeats: true
        )
    }

    @discardableResult
    func start(selections: [Slot: FamilyActivitySelection]) throws -> LadderDensity {
        guard AuthorizationCenter.shared.authorizationStatus == .approved else {
            throw MonitoringFailure.unauthorized
        }
        let active = Slot.allCases.filter { !(selections[$0]?.isEmptySelection ?? true) }
        guard !active.isEmpty else { throw MonitoringFailure.nothingSelected }

        stop()

        var lastError: Error?
        for density in LadderDensity.allCases {
            do {
                for slot in active {
                    guard let selection = selections[slot] else { continue }
                    try center.startMonitoring(
                        DeviceActivityName(slot.activityName),
                        during: dailySchedule,
                        events: events(for: slot, selection: selection, density: density)
                    )
                }
                return density
            } catch {
                lastError = error
                stop()
            }
        }
        throw MonitoringFailure.system(lastError ?? NSError(domain: "TiempoP", code: -1))
    }

    func stop() {
        center.stopMonitoring(allActivityNames)
    }

    var isActive: Bool {
        !center.activities.isEmpty
    }

    private func events(for slot: Slot,
                        selection: FamilyActivitySelection,
                        density: LadderDensity) -> [DeviceActivityEvent.Name: DeviceActivityEvent] {
        var events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [:]
        for minutes in ThresholdLadder.minutes(for: slot, density: density) {
            let name = DeviceActivityEvent.Name(EventNaming.name(slot: slot, minutes: minutes))
            events[name] = DeviceActivityEvent(
                applications: selection.applicationTokens,
                categories: selection.categoryTokens,
                webDomains: selection.webDomainTokens,
                threshold: DateComponents(hour: minutes / 60, minute: minutes % 60)
            )
        }
        return events
    }
}
