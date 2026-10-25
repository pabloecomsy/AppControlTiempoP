import SwiftUI

/// Espejo del widget dentro de la app, más historial y utilidades.
struct TodayView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List {
            Section {
                ForEach(Slot.allCases) { slot in
                    usageRow(slot)
                }
            } header: {
                HStack {
                    Text("Hoy")
                    Spacer()
                    if let updated = model.usage.updatedAt {
                        Text("actualizado \(TimeFormat.relative(updated))")
                            .textCase(nil)
                    }
                }
            } footer: {
                Text("Los valores son el último umbral alcanzado (resolución \(model.ladderDensity.title)). Son el mínimo garantizado: el real puede ser un poco mayor hasta que se cruce el siguiente peldaño.")
            }

            Section {
                NavigationLink {
                    WidgetHelpView()
                } label: {
                    Label("Cómo poner el widget en la pantalla de bloqueo", systemImage: "lock.rectangle.stack")
                }
                Button {
                    model.recalibrate()
                } label: {
                    Label("Recalibrar hoy", systemImage: "arrow.clockwise")
                }
                NavigationLink {
                    SetupView()
                } label: {
                    Label("Apps y metas", systemImage: "slider.horizontal.3")
                }
            } footer: {
                Text("Recalibrar pone el día en 0 y vuelve a pedir los umbrales a iOS; los que ya superaste hoy se vuelven a reportar en segundos.")
            }

            if !model.history.isEmpty {
                Section("Últimos días") {
                    ForEach(model.history.reversed(), id: \.dayKey) { day in
                        historyRow(day)
                    }
                }
            }

            if let error = model.errorMessage {
                Section {
                    Text(error).foregroundStyle(.red).font(.footnote)
                }
            }
        }
        .navigationTitle("TiempoP")
        .refreshable { model.refresh() }
    }

    private func usageRow(_ slot: Slot) -> some View {
        let minutes = model.usage.minutes(for: slot)
        let goal = model.goal(for: slot)
        let tone = UsageTone(minutes: minutes, goal: goal)
        return HStack(spacing: 12) {
            SlotIcon(slot: slot, size: 38)
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text(slot.title).font(.body.weight(.semibold))
                    Spacer()
                    Text(TimeFormat.spoken(minutes))
                        .font(.body.weight(.bold).monospacedDigit())
                        .foregroundStyle(tone.color)
                }
                UsageBar(ratio: usageRatio(minutes: minutes, goal: goal), color: tone.color, height: 6)
                Text("meta \(TimeFormat.spoken(goal))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private func historyRow(_ day: DailyUsage) -> some View {
        HStack {
            Text(day.dayKey)
                .font(.subheadline.monospacedDigit())
            Spacer()
            ForEach(Slot.allCases) { slot in
                HStack(spacing: 3) {
                    Image(systemName: slot.symbol)
                        .font(.caption2)
                        .foregroundStyle(slot.color)
                    Text(TimeFormat.compact(day.minutes(for: slot)))
                        .font(.caption.monospacedDigit())
                }
            }
        }
    }
}
