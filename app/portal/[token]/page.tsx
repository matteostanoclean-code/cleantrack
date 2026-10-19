import type { Metadata } from "next";
import PortalAnsicht from "./PortalAnsicht";

/**
 * Das Kundenportal.
 *
 * Der Zugang hängt allein am geheimen Teil der Adresse. Deshalb darf diese
 * Seite nirgends auftauchen: nicht bei Google, nicht in einer Vorschau, und
 * sie darf den Link auch nicht als Verweis an fremde Seiten weiterreichen.
 */
export const metadata: Metadata = {
  title: "Ihre Reinigung",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer"
};

export default async function Seite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PortalAnsicht token={token} />;
}
