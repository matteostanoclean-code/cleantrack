import { redirect } from "next/navigation";

// Der Rechner wurde nie gebaut. Bis dahin führt die Adresse in die App.
export default function Page() {
  redirect("/mitarbeiter");
}
