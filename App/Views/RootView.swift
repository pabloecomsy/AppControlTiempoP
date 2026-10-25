import SwiftUI

/// Flujo: Autorizar → Configurar → Hoy.
struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            Group {
                if !model.isAuthorized {
                    OnboardingView()
                } else if !model.isMonitoring {
                    SetupView()
                } else {
                    TodayView()
                }
            }
        }
        .tint(Slot.instagram.color)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.refresh() }
        }
        .onAppear { model.refresh() }
    }
}
