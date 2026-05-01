"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function NewPasswordPage() {
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function savePassword() {
    setMessage("");

    if (password.length < 6) {
      setMessage("Das Passwort muss mindestens 6 Zeichen haben.");
      return;
    }

    if (password !== passwordRepeat) {
      setMessage("Die Passwörter stimmen nicht überein.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setMessage("Passwort konnte nicht geändert werden. Bitte Link erneut öffnen.");
      setLoading(false);
      return;
    }

    setPassword("");
    setPasswordRepeat("");
    setMessage("Passwort wurde geändert. Du kannst dich jetzt einloggen.");
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-sm">
        <h1 className="text-2xl font-bold mb-2">Neues Passwort erstellen</h1>

        <p className="text-gray-500 mb-6">
          Bitte vergib ein neues Passwort.
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
          onClick={savePassword}
          className="w-full p-4 rounded-2xl bg-blue-500 text-white font-bold disabled:opacity-50"
        >
          {loading ? "Wird gespeichert..." : "Passwort speichern"}
        </button>

        {message && (
          <div className="mt-4 text-center">
            <p className="text-gray-700 font-medium">{message}</p>

            {message.includes("geändert") && (
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