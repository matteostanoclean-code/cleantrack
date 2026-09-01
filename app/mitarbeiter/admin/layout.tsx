import { Suspense } from "react";
import AdminSeitenleiste from "./AdminSeitenleiste";

/**
 * Rahmen für alle Adminseiten.
 *
 * Am Rechner links die dunkle Seitenleiste, rechts der Inhalt über die volle
 * Breite. Am Handy ist die Leiste ausgeblendet, dort führen die Kacheln im
 * Dashboard.
 *
 * Die Leiste liest den Suchteil der Adresse, um den richtigen Reiter zu
 * markieren. Next verlangt dafür eine Suspense-Grenze, sonst scheitert der
 * Bau der statischen Seiten.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] bg-paper-100">
      <Suspense fallback={<div className="hidden w-[248px] shrink-0 bg-[#141d33] md:block" />}>
        <AdminSeitenleiste />
      </Suspense>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
