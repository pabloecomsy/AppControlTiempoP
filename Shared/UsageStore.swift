import Foundation
import WidgetKit

/// Persistencia compartida (App Group UserDefaults). Lo usan los tres procesos:
///  - la app, para leer el día actual, metas e historial y para configurar;
///  - la extensión de monitoreo, para escribir los umbrales alcanzados;
///  - el widget, solo para leer.
final class UsageStore {
    static let shared = UsageStore()

    private let defaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private enum Key {
        static let today        = "usage.today"
        static let history      = "usage.history"
        static let goals        = "goals"
        static let isMonitoring = "monitoring.active"
        static let density      = "monitoring.density"
        static let startedAt    = "monitoring.startedAt"
    }

    /// Días de historial que se conservan en el App Group.
    private let historyLimit = 30

    init(defaults: UserDefaults = AppGroup.defaults) {
        self.defaults = defaults
    }

    // MARK: - Día

    static func dayKey(for date: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.timeZone = TimeZone.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func nextMidnight(after date: Date = Date()) -> Date {
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: date)
        return calendar.date(byAdding: .day, value: 1, to: start) ?? date.addingTimeInterval(86_400)
    }

    /// Uso de hoy. Si lo guardado es de otro día devuelve un día vacío
    /// (sin tocar el disco: el widget solo lee).
    func today(now: Date = Date()) -> DailyUsage {
        let key = Self.dayKey(for: now)
        if let stored = loadToday(), stored.dayKey == key {
            return stored
        }
        return .empty(dayKey: key)
    }

    /// Si lo guardado pertenece a un día anterior, lo archiva en el historial y
    /// deja un día vacío. Idempotente: se puede llamar cuantas veces haga falta.
    func rolloverIfNeeded(now: Date = Date()) {
        let key = Self.dayKey(for: now)
        guard let stored = loadToday() else {
            saveToday(.empty(dayKey: key))
            return
        }
        guard stored.dayKey != key else { return }
        if !stored.isEmpty {
            appendHistory(stored)
        }
        saveToday(.empty(dayKey: key))
    }

    /// Llamado por la extensión de monitoreo cuando se cruza un umbral.
    func record(slot: Slot, minutes: Int, now: Date = Date()) {
        rolloverIfNeeded(now: now)
        var usage = today(now: now)
        usage.record(slot, minutes: minutes, at: now)
        saveToday(usage)
    }

    /// Borra el día actual (se usa al recalibrar: iOS vuelve a disparar de
    /// inmediato los umbrales que ya se habían superado hoy).
    func resetToday(now: Date = Date()) {
        saveToday(.empty(dayKey: Self.dayKey(for: now)))
    }

    private func loadToday() -> DailyUsage? {
        guard let data = defaults.data(forKey: Key.today) else { return nil }
        return try? decoder.decode(DailyUsage.self, from: data)
    }

    private func saveToday(_ usage: DailyUsage) {
        if let data = try? encoder.encode(usage) {
            defaults.set(data, forKey: Key.today)
        }
    }

    // MARK: - Historial

    var history: [DailyUsage] {
        guard let data = defaults.data(forKey: Key.history),
              let list = try? decoder.decode([DailyUsage].self, from: data)
        else { return [] }
        return list
    }

    private func appendHistory(_ day: DailyUsage) {
        var list = history.filter { $0.dayKey != day.dayKey }
        list.append(day)
        list.sort { $0.dayKey < $1.dayKey }
        if list.count > historyLimit {
            list.removeFirst(list.count - historyLimit)
        }
        if let data = try? encoder.encode(list) {
            defaults.set(data, forKey: Key.history)
        }
    }

    // MARK: - Metas

    var goals: [Slot: Int] {
        get {
            var result: [Slot: Int] = [:]
            let stored = defaults.dictionary(forKey: Key.goals) as? [String: Int] ?? [:]
            for slot in Slot.allCases {
                result[slot] = stored[slot.rawValue] ?? slot.defaultGoalMinutes
            }
            return result
        }
        set {
            var stored: [String: Int] = [:]
            for (slot, minutes) in newValue { stored[slot.rawValue] = minutes }
            defaults.set(stored, forKey: Key.goals)
        }
    }

    // MARK: - Estado del monitoreo

    var isMonitoring: Bool {
        get { defaults.bool(forKey: Key.isMonitoring) }
        set { defaults.set(newValue, forKey: Key.isMonitoring) }
    }

    var ladderDensity: LadderDensity {
        get { LadderDensity(rawValue: defaults.integer(forKey: Key.density)) ?? .fine }
        set { defaults.set(newValue.rawValue, forKey: Key.density) }
    }

    var monitoringStartedAt: Date? {
        get { defaults.object(forKey: Key.startedAt) as? Date }
        set { defaults.set(newValue, forKey: Key.startedAt) }
    }

    // MARK: - Widget

    /// Pide a WidgetKit que vuelva a pedir la línea de tiempo. Lo llama el
    /// monitor tras cada umbral y la app tras cambios de configuración.
    func reloadWidgets() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}
