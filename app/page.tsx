"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    try {
      setLoading(true);
      setMessage("");

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage("Login fehlgeschlagen: " + error.message);
        return;
      }

      setMessage("Login erfolgreich");
      router.push("/dashboard");
    } catch {
      setMessage("Login fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-slate-800">
              <Image
                src="/logo.png"
                alt="StanoClean Logo"
                width={80}
                height={80}
                className="h-full w-full object-contain"
                priority
              />
            </div>

            <h1 className="text-3xl font-bold tracking-tight">StanoClean</h1>
            <p className="mt-2 text-sm text-slate-400">
              Bitte mit deinen Zugangsdaten anmelden
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm text-slate-300">E-Mail</label>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
                type="email"
                placeholder="name@firma.de"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Passwort</label>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
                type="password"
                placeholder="Passwort"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              className="w-full rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={login}
              disabled={loading}
            >
              {loading ? "Anmelden..." : "Anmelden"}
            </button>

            {message ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-800/70 px-4 py-3 text-sm text-slate-300">
                {message}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}