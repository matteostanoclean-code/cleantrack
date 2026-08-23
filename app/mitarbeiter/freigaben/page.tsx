import { redirect } from "next/navigation";

// Alte Adresse. Die Seite liegt jetzt im Adminbereich, damit sie den gleichen
// Rahmen mit Seitenleiste bekommt wie alle anderen Adminseiten.
export default function Page() {
  redirect("/mitarbeiter/admin/freigaben");
}