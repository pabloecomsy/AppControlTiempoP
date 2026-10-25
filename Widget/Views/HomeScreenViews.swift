import SwiftUI
import WidgetKit

// MARK: - Medium (pantalla de inicio / StandBy): el boceto del usuario.
// Izquierda: tres filas (icono en círculo, nombre, barra, tiempo).
// Derecha: total del iPhone hoy, en grande.

struct HomeMediumView: View {
    let entry: UsageEntry

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 9) {
                ForEach(Slot.socialSlots) { slot in
                    row(slot)
                }
            }
            .frame(maxWidth: .infinity)

            Divider()

            VStack(spacing: 4) {
                Image(systemName: Slot.device.symbol)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.secondary)
                Text("Hoy")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(TimeFormat.short(entry.minutes(.device)))
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                    .foregroundStyle(entry.tone(.device).color)
                Text("meta \(TimeFormat.short(entry.goal(.device)))")
                    .font(.system(size: 9))
                    .foregroundStyle(.tertiary)
                if !entry.isMonitoring {
                    Text("Sin activar")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.red)
                } else if let updated = entry.usage.updatedAt {
                    Text(TimeFormat.relative(updated, now: entry.date))
                        .font(.system(size: 9))
                        .foregroundStyle(.tertiary)
                }
            }
            .frame(width: 92)
        }
    }

    private func row(_ slot: Slot) -> some View {
        let minutes = entry.minutes(slot)
        let tone = entry.tone(slot)
        return HStack(spacing: 8) {
            SlotIcon(slot: slot, size: 30)
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(slot.title)
                        .font(.system(size: 12, weight: .semibold))
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text(TimeFormat.short(minutes))
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(tone.color)
                }
                UsageBar(ratio: entry.ratio(slot), color: tone.color, height: 5)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(slot.title): \(TimeFormat.spoken(minutes))")
    }
}

// MARK: - Small: total del iPhone + Instagram.

struct HomeSmallView: View {
    let entry: UsageEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: Slot.device.symbol)
                    .foregroundStyle(.secondary)
                Text("Hoy")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
            }
            Text(TimeFormat.short(entry.minutes(.device)))
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .monospacedDigit()
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .foregroundStyle(entry.tone(.device).color)

            Spacer(minLength: 2)

            ForEach([Slot.instagram, Slot.facebook]) { slot in
                HStack(spacing: 6) {
                    Image(systemName: slot.symbol)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(slot.color)
                        .frame(width: 14)
                    UsageBar(ratio: entry.ratio(slot), color: entry.tone(slot).color, height: 4)
                    Text(TimeFormat.compact(entry.minutes(slot)))
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .frame(width: 40, alignment: .trailing)
                }
            }
        }
    }
}
