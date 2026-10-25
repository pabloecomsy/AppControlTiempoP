import FamilyControls
import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(spacing: 28) {
            Spacer()

            Image(systemName: "hourglass.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(Slot.instagram.color)

            VStack(spacing: 10) {
                Text("TiempoP")
                    .font(.largeTitle.bold())
                Text("Mira cuánto tiempo llevas hoy en Instagram, Facebook, el navegador y el iPhone antes de volver a desbloquearlo.")
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 24)
            }

            VStack(alignment: .leading, spacing: 12) {
                bullet("lock.shield", "Sin cuenta, sin internet. Todo se queda en tu iPhone.")
                bullet("clock.arrow.circlepath", "Se reinicia solo a las 12:00 am.")
                bullet("rectangle.3.group", "Widget para la pantalla de bloqueo y la de inicio.")
            }
            .padding(.horizontal, 32)

            Spacer()

            if let error = model.errorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            if model.authorizationStatus == .denied {
                Text("La autorización fue denegada. Ve a Ajustes › Tiempo en pantalla › Apps con acceso y vuelve a permitir TiempoP.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            Button {
                Task { await model.requestAuthorization() }
            } label: {
                HStack {
                    if model.isBusy { ProgressView().tint(.white) }
                    Text("Autorizar Tiempo en pantalla")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .disabled(model.isBusy)
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .navigationBarHidden(true)
    }

    private func bullet(_ symbol: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol)
                .frame(width: 24)
                .foregroundStyle(Slot.instagram.color)
            Text(text).font(.subheadline)
        }
    }
}
