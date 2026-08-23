import Link from "next/link";

export default function Page() {
  return (
    <main className="min-h-screen bg-paper-100 p-6 text-ink-900">
      <div className="mx-auto max-w-md space-y-4 rounded-3xl border border-paper-300 bg-white p-6">
        <h1 className="text-2xl font-black">Admin</h1>
        <p className="text-sm text-ink-400">Hier kommst du zu den wichtigsten Admin-Bereichen der mobilen App.</p>
        <Link href="/mitarbeiter/admin" className="block rounded-2xl bg-brand-600 px-5 py-3 text-center font-bold">Admin-Dashboard öffnen</Link>
        <Link href="/mitarbeiter/admin/freigaben" className="block rounded-2xl border border-paper-300 bg-paper-100 px-5 py-3 text-center font-bold text-brand-700">Admin-Freigaben öffnen</Link>
        <Link href="/mitarbeiter/admin/aktivieren" className="block rounded-2xl border border-paper-300 bg-paper-100 px-5 py-3 text-center font-bold text-brand-700">Mitarbeiter aktivieren</Link>
        <Link href="/mitarbeiter" className="block rounded-2xl border border-paper-300 px-5 py-3 text-center font-bold text-ink-600">Zur Mitarbeiter-App</Link>
      </div>
    </main>
  );
}
