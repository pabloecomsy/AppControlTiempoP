import Combine
import FamilyControls
import Foundation

/// Estado de la app. Toda la lógica de UI pasa por aquí.
@MainActor
final class AppModel: ObservableObject {
    @Published var authorizationStatus: AuthorizationStatus
    @Published var selections: [Slot: FamilyActivitySelection]
    @Published var goals: [Slot: Int]
    @Published var usage: DailyUsage
    @Published var history: [DailyUsage]
    @Published var isMonitoring: Bool
    @Published var ladderDensity: LadderDensity
    @Published var errorMessage: String?
    @Published var isBusy = false

    private let store = UsageStore.shared
    private let selectionStore = SelectionStore()
    private let monitoring = MonitoringManager()

    init() {
        authorizationStatus = AuthorizationCenter.shared.authorizationStatus
        selections = selectionStore.load()
        goals = store.goals
        usage = store.today()
        history = store.history
        isMonitoring = store.isMonitoring
        ladderDensity = store.ladderDensity
    }

    // MARK: - Estado derivado

    var isAuthorized: Bool { authorizationStatus == .approved }

    var hasAnySelection: Bool {
        selections.values.contains { !$0.isEmptySelection }
    }

    func goal(for slot: Slot) -> Int {
        goals[slot] ?? slot.defaultGoalMinutes
    }

    /// Lo que se ve en pantalla debe ser lo mismo que ve el widget.
    func refresh() {
        authorizationStatus = AuthorizationCenter.shared.authorizationStatus
        usage = store.today()
        history = store.history
        isMonitoring = store.isMonitoring
        ladderDensity = store.ladderDensity
        goals = store.goals
    }

    // MARK: - Autorización (una sola vez, sin cuentas)

    func requestAuthorization() async {
        isBusy = true
        defer { isBusy = false }
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            errorMessage = nil
        } catch {
            errorMessage = "No se pudo autorizar: \(error.localizedDescription)"
        }
        authorizationStatus = AuthorizationCenter.shared.authorizationStatus
    }

    // MARK: - Configuración

    func binding(for slot: Slot) -> FamilyActivitySelection {
        selections[slot] ?? FamilyActivitySelection(includeEntireCategory: slot.isDevice)
    }

    func update(selection: FamilyActivitySelection, for slot: Slot) {
        selections[slot] = selection
        selectionStore.save(selections)
    }

    func update(goal minutes: Int, for slot: Slot) {
        goals[slot] = max(5, minutes)
        store.goals = goals
        store.reloadWidgets()
    }

    // MARK: - Monitoreo

    func startMonitoring() {
        isBusy = true
        defer { isBusy = false }
        do {
            let density = try monitoring.start(selections: selections)
            store.isMonitoring = true
            store.ladderDensity = density
            store.monitoringStartedAt = Date()
            errorMessage = nil
        } catch {
            store.isMonitoring = false
            errorMessage = error.localizedDescription
        }
        store.reloadWidgets()
        refresh()
    }

    func stopMonitoring() {
        monitoring.stop()
        store.isMonitoring = false
        store.monitoringStartedAt = nil
        store.reloadWidgets()
        refresh()
    }

    /// Pone el día en 0 y vuelve a registrar los umbrales. iOS dispara de
    /// inmediato los que ya se superaron hoy, así que el widget se reconstruye solo.
    func recalibrate() {
        store.resetToday()
        startMonitoring()
    }
}
