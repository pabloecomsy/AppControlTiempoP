import SwiftUI

/// Tono semáforo según la relación uso/meta. Compartido entre app y widget para
/// que ambos cuenten la misma historia.
enum UsageTone {
    case ok      // < 60 % de la meta
    case warn    // 60 % – 99 %
    case over    // ≥ 100 %

    init(minutes: Int, goal: Int) {
        guard goal > 0 else { self = .ok; return }
        let ratio = Double(minutes) / Double(goal)
        if ratio >= 1.0 { self = .over }
        else if ratio >= 0.6 { self = .warn }
        else { self = .ok }
    }

    var color: Color {
        switch self {
        case .ok:   return Color(red: 0.20, green: 0.70, blue: 0.45)
        case .warn: return Color(red: 0.95, green: 0.60, blue: 0.15)
        case .over: return Color(red: 0.90, green: 0.25, blue: 0.25)
        }
    }
}

/// Proporción uso/meta acotada a [0, 1].
func usageRatio(minutes: Int, goal: Int) -> Double {
    guard goal > 0 else { return 0 }
    return min(1.0, max(0.0, Double(minutes) / Double(goal)))
}

/// Barra horizontal de progreso, sin dependencias de WidgetKit, utilizable en
/// la app y en todos los tamaños de widget.
struct UsageBar: View {
    let ratio: Double
    let color: Color
    var height: CGFloat = 5

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(color.opacity(0.18))
                Capsule()
                    .fill(color)
                    .frame(width: max(height, geo.size.width * ratio))
            }
        }
        .frame(height: height)
    }
}

/// Icono circular de un slot.
struct SlotIcon: View {
    let slot: Slot
    var size: CGFloat = 32

    var body: some View {
        ZStack {
            Circle().fill(slot.color.opacity(0.16))
            Image(systemName: slot.symbol)
                .font(.system(size: size * 0.46, weight: .semibold))
                .foregroundStyle(slot.color)
        }
        .frame(width: size, height: size)
    }
}
