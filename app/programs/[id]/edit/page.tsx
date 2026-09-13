import { redirect } from "next/navigation";

/**
 * L'écran de programme n'existe plus (CM-81) : la bibliothèque de séances vit
 * sur `/seances`. Cette redirection reste en place pour les signets et pour
 * l'icône d'accueil iOS, qui peuvent encore pointer ici.
 */

export default function RedirectToSeances() {
  redirect("/seances");
}
