import Foundation

/// Uso de un día. Es lo único que viaja entre el monitor y el widget.
///
/// `dayKey` (yyyy-MM-dd en la zona horaria local) es el seguro contra días
/// viejos: el widget solo muestra los minutos si `dayKey` es hoy; si no, muestra 0.
/// Así el reset de medianoche funciona aunque iOS retrase el aviso al monitor.
struct DailyUsage: Codable, Equatable {
    var dayKey: String
    /// Minutos por slot (clave = Slot.rawValue). Es el mínimo garantizado de uso:
    /// el último umbral alcanzado.
    var minutes: [String: Int]
    var updatedAt: Date?

    static func empty(dayKey: String) -> DailyUsage {
        DailyUsage(dayKey: dayKey, minutes: [:], updatedAt: nil)
    }

    func minutes(for slot: Slot) -> Int {
        minutes[slot.rawValue] ?? 0
    }

    var isEmpty: Bool {
        minutes.values.allSatisfy { $0 == 0 }
    }

    /// Guarda un umbral alcanzado. Nunca baja un valor ya registrado: los eventos
    /// de iOS pueden llegar desordenados.
    mutating func record(_ slot: Slot, minutes value: Int, at date: Date) {
        let current = minutes(for: slot)
        if value > current {
            minutes[slot.rawValue] = value
        }
        updatedAt = date
    }
}
