import { redirect } from "next/navigation";

// Alte Adresse aus der ersten Version. Führt direkt in die App, statt eine leere Seite zu zeigen.
export default function Page() {
  redirect("/mitarbeiter");
}
