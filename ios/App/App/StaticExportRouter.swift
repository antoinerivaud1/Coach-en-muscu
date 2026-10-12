import Foundation
import Capacitor

/// CM-89 (PR 4) : routeur des fichiers embarqués pour l'export statique de Next.
///
/// Pourquoi : le routeur par défaut de Capacitor (`CapacitorRouter`) sert
/// `index.html` pour TOUT chemin sans extension, comme pour une app à page
/// unique. Or l'export de Next produit une page HTML par écran
/// (`dashboard.html`, `sessions/view.html`…) : au premier lancement et à
/// chaque rechargement complet (`window.location.assign("/login")` après
/// connexion, déconnexion, suppression du compte), l'app afficherait
/// l'accueil au lieu de l'écran demandé.
///
/// Correspondance (chemin demandé → fichier sous `basePath`) :
/// - vide ou `/` → `/index.html` ;
/// - avec extension (`.js`, `.css`, `.txt` des données RSC…) → inchangé ;
/// - sans extension → `<chemin>.html` s'il existe, sinon
///   `<chemin>/index.html` s'il existe (export avec `trailingSlash`), sinon
///   `/index.html`.
///
/// Le protocole `Router` de Capacitor 6 ne reçoit qu'un chemin :
/// `WebViewAssetHandler` passe `url.path`, déjà sans query (`?id=…`) ni
/// fragment. Seul le « / » final éventuel est retiré ici.
struct StaticExportRouter: Router {
    var basePath: String = ""

    func route(for path: String) -> String {
        var cleanPath = path
        while cleanPath.count > 1 && cleanPath.hasSuffix("/") {
            cleanPath.removeLast()
        }
        if cleanPath.isEmpty || cleanPath == "/" {
            return basePath + "/index.html"
        }
        if !cleanPath.hasPrefix("/") {
            cleanPath = "/" + cleanPath
        }
        // Jamais de remontée hors du dossier embarqué.
        if cleanPath.split(separator: "/").contains("..") {
            return basePath + "/index.html"
        }

        if !URL(fileURLWithPath: cleanPath).pathExtension.isEmpty {
            return basePath + cleanPath
        }

        let htmlPage = basePath + cleanPath + ".html"
        if isRegularFile(htmlPage) {
            return htmlPage
        }
        let indexPage = basePath + cleanPath + "/index.html"
        if isRegularFile(indexPage) {
            return indexPage
        }
        return basePath + "/index.html"
    }

    private func isRegularFile(_ path: String) -> Bool {
        var isDirectory: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory)
        return exists && !isDirectory.boolValue
    }
}
