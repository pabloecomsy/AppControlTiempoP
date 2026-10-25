import Foundation

/// Codifica/decodifica el nombre de un `DeviceActivityEvent`.
/// Formato: "<slot>.<minutos>"  →  "instagram.15"
enum EventNaming {
    static func name(slot: Slot, minutes: Int) -> String {
        "\(slot.rawValue).\(minutes)"
    }

    static func parse(_ raw: String) -> (slot: Slot, minutes: Int)? {
        let parts = raw.split(separator: ".", maxSplits: 1)
        guard parts.count == 2,
              let slot = Slot(rawValue: String(parts[0])),
              let minutes = Int(parts[1]), minutes > 0
        else { return nil }
        return (slot, minutes)
    }
}
