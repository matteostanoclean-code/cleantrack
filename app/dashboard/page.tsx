import Link from "next/link";

export default function Page() {
  return (
    <main className="min-h-screen bg-paper-100 p-6 text-ink-900">
      <div className="mx-auto max-w-md rounded-3xl border border-paper-300 bg-white p-6">
        <h1 className="text-2xl font-black">Dashboard</h1>
        <p className="mt-2 text-sm text-ink-400">Die mobile App ist jetzt der Startpunkt.</p>
        <Link href="/mitarbeiter" className="mt-6 block rounded-2xl bg-brand-600 px-5 py-3 text-center font-bold">Zur App</Link>
      </div>
    </main>
  );
}
