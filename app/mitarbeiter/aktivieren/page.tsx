"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function ActivateEmployeeForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function activate() {
    setMessage("");

    if (!token) {
      setMessage("Aktivierungslink fehlt.");
      return;
    }

    if (password.length < 6) {
      setMessage("Das Passwort muss mindestens 6 Zeichen haben.");
      return;
    }

    if (password !== passwordRepeat) {
      setMessage("Die Passwörter stimmen nicht überein.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/activate-employee", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Aktivierung fehlgeschlagen.");
        setLoading(false);
        return;
      }

      setMessage("Dein Zugang wurde aktiviert. Du kannst dich jetzt einloggen.");
      setPassword("");
      setPasswordRepeat("");
    } catch {
      setMessage("Aktivierung konnte nicht ausgeführt werden. Bitte Internet prüfen.");
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-sm">
        <h1 className="text-2xl font-bold mb-2">Zugang aktivieren</h1>

        <p className="text-gray-500 mb-6">
          Bitte vergib dein eigenes Passwort.
        </p>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Neues Passwort"
          className="w-full mb-3 p-4 rounded-2xl bg-gray-100 outline-none"
        />

        <input
          type="password"
          value={passwordRepeat}
          onChange={(e) => setPasswordRepeat(e.target.value)}
          placeholder="Passwort wiederholen"
          className="w-full mb-4 p-4 rounded-2xl bg-gray-100 outline-none"
        />

        <button
          type="button"
          disabled={loading}
          onClick={activate}
          className="w-full p-4 rounded-2xl bg-blue-500 text-white font-bold disabled:opacity-50"
        >
          {loading ? "Wird aktiviert..." : "Zugang aktivieren"}
        </button>

        {message && (
  <div className="mt-4 text-center">
    <p className="text-gray-700 font-medium">{message}</p>

    {message.includes("aktiviert") && (
      <button
        type="button"
        onClick={() => (window.location.href = "/mitarbeiter")}
        className="mt-4 w-full p-4 rounded-2xl bg-green-500 text-white font-bold"
      >
        Jetzt einloggen
      </button>
    )}
  </div>
)}
      </div>
    </main>
  );
}

export default function ActivateEmployeePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f4f7fb] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-sm">
            <p className="text-center text-gray-500 font-medium">
              Aktivierungsseite lädt...
            </p>
          </div>
        </main>
      }
    >
      <ActivateEmployeeForm />
    </Suspense>
  );
}