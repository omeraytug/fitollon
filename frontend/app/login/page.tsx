"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (response.ok) {
      router.replace("/");
      return;
    }
    const body = await response.json().catch(() => null);
    setError(body?.detail ?? "Login failed");
    setBusy(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-hairline bg-surface p-6">
        <h1 className="text-xl font-semibold tracking-tight">Fitollon</h1>
        <p className="mt-1 text-sm text-ink-2">Log in to see your data and talk to your coach.</p>
        <label className="mt-6 block text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-hairline bg-page px-3 py-2 outline-none focus:border-accent"
        />
        {error && <p className="mt-2 text-sm text-critical">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-4 w-full rounded-md bg-accent px-3 py-2 font-medium text-accent-ink disabled:opacity-50"
        >
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}
