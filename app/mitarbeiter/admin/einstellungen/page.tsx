import { redirect } from "next/navigation";
import { BEREICHE } from "@/lib/einstellungenPlan";

/** Einstellungen ohne Bereich landen auf der ersten Seite. */
export default function Seite() {
  const ersterBereich = BEREICHE[0];
  redirect(`/mitarbeiter/admin/einstellungen/${ersterBereich.schluessel}/${ersterBereich.gruppen[0].schluessel}`);
}
