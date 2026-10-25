import FamilyControls
import SwiftUI

/// Selección de apps por slot, metas diarias y botón de activar.
/// También se usa como pantalla de ajustes una vez activado el monitoreo.
struct SetupView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var pickerSlot: Slot?

    var isSettingsMode: Bool { model.isMonitoring }

    var body: some View {
        Form {
            Section {
                ForEach(Slot.allCases) { slot in
                    slotRow(slot)
                }
            } header: {
                Text("Qué medir")
            } footer: {
                Text("Las selecciones se guardan en tu iPhone. Aunque borres y reinstales Instagram, iOS la identifica por la misma app y el conteo sigue.")
            }

            Section {
                ForEach(Slot.allCases) { slot in
                    goalRow(slot)
                }
            } header: {
                Text("Metas diarias")
            } footer: {
                Text("Solo sirven para colorear las barras (verde, naranja, rojo). No bloquean nada.")
            }

            Section {
                if let error = model.errorMessage {
                    Text(error).foregroundStyle(.red).font(.footnote)
                }
                Button {
                    model.startMonitoring()
                    if model.isMonitoring { dismiss() }
                } label: {
                    HStack {
                        if model.isBusy { ProgressView() }
                        Text(isSettingsMode ? "Guardar y reiniciar monitoreo" : "Activar monitoreo")
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                    }
                }
                .disabled(!model.hasAnySelection || model.isBusy)

                if isSettingsMode {
                    Button("Detener monitoreo", role: .destructive) {
                        model.stopMonitoring()
                        dismiss()
                    }
                }
            } footer: {
                Text("El monitoreo corre en segundo plano, sin abrir la app. Si lo activas a media tarde, iOS reporta de inmediato lo que ya llevas hoy.")
            }
        }
        .navigationTitle(isSettingsMode ? "Ajustes" : "Configurar")
        .familyActivityPicker(
            isPresented: Binding(
                get: { pickerSlot != nil },
                set: { if !$0 { pickerSlot = nil } }
            ),
            selection: Binding(
                get: { pickerSlot.map { model.binding(for: $0) } ?? FamilyActivitySelection() },
                set: { newValue in
                    if let slot = pickerSlot { model.update(selection: newValue, for: slot) }
                }
            )
        )
    }

    private func slotRow(_ slot: Slot) -> some View {
        let selection = model.binding(for: slot)
        return Button {
            pickerSlot = slot
        } label: {
            HStack(spacing: 12) {
                SlotIcon(slot: slot, size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(slot.title)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text(selection.isEmptySelection ? slot.pickerHint : selection.summary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                    if !selection.applicationTokens.isEmpty {
                        tokenLabels(selection)
                    }
                }
                Spacer()
                Image(systemName: selection.isEmptySelection ? "plus.circle" : "checkmark.circle.fill")
                    .foregroundStyle(selection.isEmptySelection ? Color.secondary : Color.green)
            }
        }
    }

    /// Iconos reales de las apps elegidas (solo visibles dentro de la app).
    private func tokenLabels(_ selection: FamilyActivitySelection) -> some View {
        HStack(spacing: 8) {
            ForEach(Array(selection.applicationTokens.prefix(4)), id: \.self) { token in
                Label(token)
                    .labelStyle(.iconOnly)
                    .frame(width: 22, height: 22)
            }
            if selection.applicationTokens.count > 4 {
                Text("+\(selection.applicationTokens.count - 4)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.top, 2)
    }

    private func goalRow(_ slot: Slot) -> some View {
        let goal = model.goal(for: slot)
        return Stepper(
            value: Binding(
                get: { goal },
                set: { model.update(goal: $0, for: slot) }
            ),
            in: 5...1440,
            step: slot.isDevice ? 30 : 5
        ) {
            HStack {
                Image(systemName: slot.symbol)
                    .foregroundStyle(slot.color)
                    .frame(width: 22)
                Text(slot.title)
                Spacer()
                Text(TimeFormat.spoken(goal))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
    }
}
