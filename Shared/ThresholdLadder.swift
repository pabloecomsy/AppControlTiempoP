import Foundation

/// Densidad de la escalera de umbrales. Si iOS rechaza el monitoreo por exceso
/// de eventos, la app reintenta automáticamente con la siguiente densidad.
enum LadderDensity: Int, CaseIterable, Codable {
    case fine = 0
    case medium
    case coarse

    var title: String {
        switch self {
        case .fine:   return "fina (1 min)"
        case .medium: return "media (5 min)"
        case .coarse: return "gruesa (10 min)"
        }
    }
}

/// La "escalera de umbrales" es el corazón del sistema.
///
/// iOS no permite que un widget lea el tiempo de uso directamente. Lo que sí
/// permite es registrar eventos del tipo "avísame cuando Instagram llegue a N
/// minutos hoy". Registramos uno por cada peldaño (1, 2, 3 … 15, 20, 25 … min).
/// Cada vez que el sistema avisa, la extensión de monitoreo guarda N como el
/// mínimo garantizado de uso del día. La resolución es fina al principio (que es
/// cuando más importa tomar conciencia) y se va abriendo conforme crece el uso.
enum ThresholdLadder {

    /// Peldaños en minutos, ordenados y sin repetir.
    static func minutes(for slot: Slot, density: LadderDensity) -> [Int] {
        let segments: [(upTo: Int, step: Int)]
        switch (slot.isDevice, density) {
        case (false, .fine):   segments = [(15, 1), (60, 5), (180, 15), (480, 30)]
        case (false, .medium): segments = [(30, 5), (180, 15), (480, 30)]
        case (false, .coarse): segments = [(60, 10), (480, 30)]
        case (true, .fine):    segments = [(120, 10), (480, 30), (1080, 60)]
        case (true, .medium):  segments = [(240, 15), (1080, 60)]
        case (true, .coarse):  segments = [(240, 30), (1080, 60)]
        }
        return build(segments)
    }

    static func build(_ segments: [(upTo: Int, step: Int)]) -> [Int] {
        var result: [Int] = []
        var current = 0
        for segment in segments {
            while current + segment.step <= segment.upTo {
                current += segment.step
                result.append(current)
            }
        }
        return result
    }

    /// Número total de eventos que se registrarían con una densidad dada.
    static func eventCount(density: LadderDensity, slots: [Slot]) -> Int {
        slots.reduce(0) { $0 + minutes(for: $1, density: density).count }
    }
}
