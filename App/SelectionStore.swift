import FamilyControls
import Foundation

/// Guarda las selecciones de apps por slot en el App Group.
/// `FamilyActivitySelection` es Codable: los tokens son opacos pero persistentes
/// para la misma app (mismo bundle id), por eso sobreviven a reinstalaciones.
final class SelectionStore {
    private let defaults: UserDefaults
    private let key = "selections"

    init(defaults: UserDefaults = AppGroup.defaults) {
        self.defaults = defaults
    }

    func load() -> [Slot: FamilyActivitySelection] {
        var result: [Slot: FamilyActivitySelection] = [:]
        for slot in Slot.allCases {
            result[slot] = FamilyActivitySelection(includeEntireCategory: slot.isDevice)
        }
        guard let data = defaults.data(forKey: key),
              let stored = try? JSONDecoder().decode([String: FamilyActivitySelection].self, from: data)
        else { return result }
        for (raw, selection) in stored {
            if let slot = Slot(rawValue: raw) { result[slot] = selection }
        }
        return result
    }

    func save(_ selections: [Slot: FamilyActivitySelection]) {
        var stored: [String: FamilyActivitySelection] = [:]
        for (slot, selection) in selections { stored[slot.rawValue] = selection }
        if let data = try? JSONEncoder().encode(stored) {
            defaults.set(data, forKey: key)
        }
    }
}

extension FamilyActivitySelection {
    var isEmptySelection: Bool {
        applicationTokens.isEmpty && categoryTokens.isEmpty && webDomainTokens.isEmpty
    }

    /// "2 apps · 1 categoría · 1 sitio"
    var summary: String {
        var parts: [String] = []
        if !applicationTokens.isEmpty {
            parts.append(applicationTokens.count == 1 ? "1 app" : "\(applicationTokens.count) apps")
        }
        if !categoryTokens.isEmpty {
            parts.append(categoryTokens.count == 1 ? "1 categoría" : "\(categoryTokens.count) categorías")
        }
        if !webDomainTokens.isEmpty {
            parts.append(webDomainTokens.count == 1 ? "1 sitio" : "\(webDomainTokens.count) sitios")
        }
        return parts.isEmpty ? "Sin seleccionar" : parts.joined(separator: " · ")
    }
}
