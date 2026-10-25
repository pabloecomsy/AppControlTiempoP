import Foundation

enum TimeFormat {
    /// "0m", "45m", "1h 12m", "3h"  → widgets de Home Screen y app.
    static func short(_ minutes: Int) -> String {
        let m = max(0, minutes)
        let hours = m / 60
        let mins = m % 60
        if hours == 0 { return "\(mins)m" }
        if mins == 0 { return "\(hours)h" }
        return "\(hours)h \(mins)m"
    }

    /// "45m", "1h12", "3h"  → pantalla de bloqueo (muy poco espacio).
    static func compact(_ minutes: Int) -> String {
        let m = max(0, minutes)
        let hours = m / 60
        let mins = m % 60
        if hours == 0 { return "\(mins)m" }
        if mins == 0 { return "\(hours)h" }
        return String(format: "%dh%02d", hours, mins)
    }

    /// "45 min", "1 h 12 min"  → texto en la app.
    static func spoken(_ minutes: Int) -> String {
        let m = max(0, minutes)
        let hours = m / 60
        let mins = m % 60
        if hours == 0 { return "\(mins) min" }
        if mins == 0 { return "\(hours) h" }
        return "\(hours) h \(mins) min"
    }

    /// "hace 3 min", "hace 1 h"
    static func relative(_ date: Date, now: Date = Date()) -> String {
        let seconds = max(0, now.timeIntervalSince(date))
        let minutes = Int(seconds / 60)
        if minutes < 1 { return "ahora" }
        if minutes < 60 { return "hace \(minutes) min" }
        let hours = minutes / 60
        return "hace \(hours) h"
    }
}
