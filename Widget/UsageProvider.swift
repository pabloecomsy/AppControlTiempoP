import Foundation
import WidgetKit

struct UsageEntry: TimelineEntry {
    let date: Date
    let usage: DailyUsage
    let goals: [Slot: Int]
    let isMonitoring: Bool

    func minutes(_ slot: Slot) -> Int { usage.minutes(for: slot) }
    func goal(_ slot: Slot) -> Int { goals[slot] ?? slot.defaultGoalMinutes }
    func ratio(_ slot: Slot) -> Double { usageRatio(minutes: minutes(slot), goal: goal(slot)) }
    func tone(_ slot: Slot) -> UsageTone { UsageTone(minutes: minutes(slot), goal: goal(slot)) }

    static var preview: UsageEntry {
        var usage = DailyUsage.empty(dayKey: UsageStore.dayKey())
        usage.minutes = [
            Slot.instagram.rawValue: 72,
            Slot.facebook.rawValue: 23,
            Slot.browser.rawValue: 40,
            Slot.device.rawValue: 185,
        ]
        usage.updatedAt = Date()
        var goals: [Slot: Int] = [:]
        for slot in Slot.allCases { goals[slot] = slot.defaultGoalMinutes }
        return UsageEntry(date: Date(), usage: usage, goals: goals, isMonitoring: true)
    }
}

/// El widget no calcula nada: lee el App Group y programa dos entradas,
/// la de ahora y una en 0 a medianoche. El monitor fuerza recargas extra cada
/// vez que se cruza un umbral, así que no hace falta refrescar por tiempo.
struct UsageProvider: TimelineProvider {
    private let store = UsageStore.shared

    func placeholder(in context: Context) -> UsageEntry {
        .preview
    }

    func getSnapshot(in context: Context, completion: @escaping (UsageEntry) -> Void) {
        if context.isPreview {
            completion(.preview)
        } else {
            completion(entry(at: Date()))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<UsageEntry>) -> Void) {
        let now = Date()
        let midnight = UsageStore.nextMidnight(after: now)
        let entries = [
            entry(at: now),
            UsageEntry(
                date: midnight,
                usage: .empty(dayKey: UsageStore.dayKey(for: midnight)),
                goals: store.goals,
                isMonitoring: store.isMonitoring
            ),
        ]
        // Poco después de medianoche pedimos una nueva línea de tiempo por si el
        // aviso del monitor se retrasó.
        completion(Timeline(entries: entries, policy: .after(midnight.addingTimeInterval(120))))
    }

    private func entry(at date: Date) -> UsageEntry {
        UsageEntry(
            date: date,
            usage: store.today(now: date),
            goals: store.goals,
            isMonitoring: store.isMonitoring
        )
    }
}
