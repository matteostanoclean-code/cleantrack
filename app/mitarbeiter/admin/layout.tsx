import AdminSeitenleiste from "./AdminSeitenleiste";

/**
 * Rahmen für alle Adminseiten.
 *
 * Am Rechner links die feste Seitenleiste, rechts der Inhalt über die volle
 * Breite. Am Handy bleibt alles wie bisher, die Seitenleiste ist dort
 * ausgeblendet.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] bg-paper-100">
      <AdminSeitenleiste />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
