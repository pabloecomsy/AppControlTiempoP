import SwiftUI
import WidgetKit

@main
struct TiempoPWidgetBundle: WidgetBundle {
    var body: some Widget {
        TiempoPWidget()
    }
}

/// Un solo widget con todas las familias. El usuario elige dónde ponerlo:
///  - Pantalla de bloqueo: rectangular (las 4 métricas), circular (IG vs meta), inline.
///  - Pantalla de inicio / StandBy: small (total + IG) y medium (boceto del usuario).
struct TiempoPWidget: Widget {
    let kind = "TiempoPWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: UsageProvider()) { entry in
            UsageWidgetView(entry: entry)
                .containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("Tiempo de hoy")
        .description("Instagram, Facebook, navegador y total del iPhone. Se reinicia a las 12:00 am.")
        .supportedFamilies([
            .accessoryRectangular,
            .accessoryCircular,
            .accessoryInline,
            .systemSmall,
            .systemMedium,
        ])
    }
}

/// Despacha por familia.
struct UsageWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: UsageEntry

    var body: some View {
        switch family {
        case .accessoryRectangular:
            LockRectangularView(entry: entry)
        case .accessoryCircular:
            LockCircularView(entry: entry)
        case .accessoryInline:
            LockInlineView(entry: entry)
        case .systemSmall:
            HomeSmallView(entry: entry)
        default:
            HomeMediumView(entry: entry)
        }
    }
}
