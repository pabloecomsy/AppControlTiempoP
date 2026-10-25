import Foundation
import SwiftUI

/// Las cuatro métricas que se monitorean. Cada "slot" tiene su propia
/// `DeviceActivityName`, su propia selección de apps y su propia escalera de umbrales.
enum Slot: String, CaseIterable, Codable, Identifiable {
    case instagram
    case facebook
    case browser
    case device

    var id: String { rawValue }

    var title: String {
        switch self {
        case .instagram: return "Instagram"
        case .facebook:  return "Facebook"
        case .browser:   return "Navegador"
        case .device:    return "iPhone"
        }
    }

    /// Etiqueta muy corta para el widget de pantalla de bloqueo.
    var shortTitle: String {
        switch self {
        case .instagram: return "IG"
        case .facebook:  return "FB"
        case .browser:   return "Web"
        case .device:    return "Total"
        }
    }

    /// SF Symbol. No se usan los logos reales de las marcas.
    var symbol: String {
        switch self {
        case .instagram: return "camera.fill"
        case .facebook:  return "person.2.fill"
        case .browser:   return "safari.fill"
        case .device:    return "iphone"
        }
    }

    var color: Color {
        switch self {
        case .instagram: return Color(red: 0.86, green: 0.25, blue: 0.55)
        case .facebook:  return Color(red: 0.16, green: 0.42, blue: 0.86)
        case .browser:   return Color(red: 0.10, green: 0.62, blue: 0.80)
        case .device:    return Color(red: 0.30, green: 0.30, blue: 0.36)
        }
    }

    /// El slot "iPhone" mide todo el dispositivo (todas las categorías).
    var isDevice: Bool { self == .device }

    /// Nombre de la actividad registrada en DeviceActivityCenter.
    var activityName: String { "tiempop.\(rawValue)" }

    /// Meta diaria sugerida (minutos). El usuario la puede cambiar en la app.
    var defaultGoalMinutes: Int {
        switch self {
        case .instagram: return 30
        case .facebook:  return 30
        case .browser:   return 60
        case .device:    return 180
        }
    }

    /// Texto de ayuda que se muestra junto al selector de apps.
    var pickerHint: String {
        switch self {
        case .instagram:
            return "Elige la app de Instagram. Tip: en la sección de sitios web agrega también instagram.com para contar el uso desde Safari."
        case .facebook:
            return "Elige la app de Facebook (y facebook.com si quieres contar la web)."
        case .browser:
            return "Elige Safari y/o el navegador que uses (Chrome, etc.)."
        case .device:
            return "Marca «Todas las apps y categorías» para medir el tiempo total del iPhone."
        }
    }

    /// Los tres slots de apps, en el orden en que se muestran.
    static let socialSlots: [Slot] = [.instagram, .facebook, .browser]
}
