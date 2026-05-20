import Link from "next/link";

export default function Page() {
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-md space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <h1 className="text-2xl font-black">Admin</h1>
        <p className="text-sm text-slate-400">Hier kommst du zu den wichtigsten Admin-Bereichen der mobilen App.</p>
        <Link href="/mitarbeiter/freigaben" className="block rounded-2xl bg-blue-600 px-5 py-3 text-center font-bold">Admin-Freigaben öffnen</Link>
        <Link href="/mitarbeiter/aktivieren" className="block rounded-2xl border border-slate-700 bg-slate-950 px-5 py-3 text-center font-bold text-blue-100">Mitarbeiter aktivieren</Link>
        <Link href="/mitarbeiter" className="block rounded-2xl border border-slate-700 px-5 py-3 text-center font-bold text-slate-200">Zur Mitarbeiter-App</Link>
      </div>
    </main>
  );
}
