import SwiftUI
import WidgetKit

// MARK: - Rectangular (≈157×72 pt): las cuatro métricas en una cuadrícula 2×2.

struct LockRectangularView: View {
    let entry: UsageEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                cell(.instagram)
                cell(.facebook)
            }
            HStack(spacing: 6) {
                cell(.browser)
                cell(.device)
            }
            if !entry.isMonitoring {
                Text("Abre TiempoP para activar")
                    .font(.system(size: 9, weight: .medium))
                    .lineLimit(1)
            } else {
                // Barra fina de Instagram respecto a su meta: la señal más importante.
                UsageBar(ratio: entry.ratio(.instagram), color: .primary, height: 3)
                    .widgetAccentable()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func cell(_ slot: Slot) -> some View {
        HStack(spacing: 3) {
            Image(systemName: slot.symbol)
                .font(.system(size: 11, weight: .semibold))
                .widgetAccentable()
            Text(TimeFormat.compact(entry.minutes(slot)))
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityLabel("\(slot.title): \(TimeFormat.spoken(entry.minutes(slot)))")
    }
}

// MARK: - Circular: Instagram contra su meta diaria.

struct LockCircularView: View {
    let entry: UsageEntry

    var body: some View {
        Gauge(value: entry.ratio(.instagram)) {
            Image(systemName: Slot.instagram.symbol)
        } currentValueLabel: {
            Text(TimeFormat.compact(entry.minutes(.instagram)))
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .monospacedDigit()
                .minimumScaleFactor(0.6)
        }
        .gaugeStyle(.accessoryCircular)
        .widgetAccentable()
        .accessibilityLabel("Instagram hoy: \(TimeFormat.spoken(entry.minutes(.instagram)))")
    }
}

// MARK: - Inline (una línea encima del reloj).

struct LockInlineView: View {
    let entry: UsageEntry

    var body: some View {
        let ig = TimeFormat.compact(entry.minutes(.instagram))
        let fb = TimeFormat.compact(entry.minutes(.facebook))
        let total = TimeFormat.compact(entry.minutes(.device))
        Text("IG \(ig) · FB \(fb) · \(Image(systemName: "iphone")) \(total)")
    }
}
