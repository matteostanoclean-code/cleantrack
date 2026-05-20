import Link from "next/link";

export default function Page() {
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <h1 className="text-2xl font-black">Admin</h1>
        <p className="mt-2 text-sm text-slate-400">Diese Layout-Version konzentriert sich zuerst auf die Mitarbeiter-App. Admin-Funktionen können danach wieder angebunden werden.</p>
        <Link href="/mitarbeiter" className="mt-6 block rounded-2xl bg-blue-600 px-5 py-3 text-center font-bold">Zur App</Link>
      </div>
    </main>
  );
}
