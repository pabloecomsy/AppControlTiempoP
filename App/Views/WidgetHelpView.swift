import SwiftUI

struct WidgetHelpView: View {
    var body: some View {
        List {
            Section("Pantalla de bloqueo") {
                step(1, "Mantén presionada la pantalla de bloqueo y toca «Personalizar».")
                step(2, "Elige «Pantalla de bloqueo» y toca el área de widgets debajo de la hora.")
                step(3, "Busca «TiempoP» y agrega el widget rectangular (las 4 métricas) o el circular (Instagram vs meta).")
                step(4, "Opcional: toca la fecha encima de la hora para poner el widget en línea.")
            }
            Section("Pantalla de inicio") {
                step(1, "Mantén presionada la pantalla de inicio y toca «Editar» › «Agregar widget».")
                step(2, "Busca «TiempoP» y elige el tamaño mediano: es el diseño con barras por app y el total a la derecha.")
            }
            Section("StandBy") {
                Text("Con el iPhone cargando de lado, desliza en la columna de widgets y agrega TiempoP.")
                    .font(.subheadline)
            }
            Section {
                Text("El widget se actualiza solo cada vez que cruzas un peldaño de uso. A las 12:00 am todo vuelve a 0.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Agregar widget")
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(n)")
                .font(.caption.bold())
                .frame(width: 22, height: 22)
                .background(Circle().fill(Slot.instagram.color.opacity(0.18)))
                .foregroundStyle(Slot.instagram.color)
            Text(text).font(.subheadline)
        }
    }
}
