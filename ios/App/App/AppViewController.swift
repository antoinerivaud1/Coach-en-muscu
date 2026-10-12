import UIKit
import Capacitor

/// CM-89 (PR 4) : contrôleur principal de l'app (référencé par
/// Base.lproj/Main.storyboard à la place de `CAPBridgeViewController`).
/// Seul changement : les fichiers embarqués sont servis par
/// `StaticExportRouter`, qui sait trouver la page HTML de chaque écran de
/// l'export statique (voir StaticExportRouter.swift).
class AppViewController: CAPBridgeViewController {
    override open func router() -> Router {
        return StaticExportRouter()
    }
}
