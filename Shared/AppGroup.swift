import Foundation

/// Identificador del App Group compartido entre la app, la extensión de monitoreo
/// y el widget. Es el único canal de comunicación entre los tres procesos.
///
/// ⚠️ Debe coincidir con `com.apple.security.application-groups` en project.yml.
enum AppGroup {
    static let identifier = "group.com.ecomsy.tiempop"

    static var defaults: UserDefaults {
        // Si el App Group no está bien configurado caemos a .standard para no
        // crashear, pero el widget no verá datos. El README explica cómo revisarlo.
        UserDefaults(suiteName: identifier) ?? .standard
    }
}
