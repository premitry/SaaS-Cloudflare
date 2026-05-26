"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth, formatError, setActor, setToken } from "../../lib/api";
import { IconCloud } from "../../components/Icon";

export default function UserLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const r = await auth.userLogin(code.trim());
      setToken(r.token);
      setActor(r.actor);
      router.replace("/dashboard");
    } catch (e) {
      setErr(formatError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-accent-400 to-accent-700 flex items-center justify-center">
            <IconCloud size={18} />
          </div>
          <span className="font-semibold text-ink-100 text-lg">CF Panel</span>
        </div>
        <div className="card card-pad space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-ink-100">User Login</h1>
            <p className="text-sm text-ink-400 mt-1">Enter your access code.</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="label">Code</label>
              <input
                className="input font-mono tracking-wide"
                placeholder="USER-K82P1"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                required
              />
            </div>
            {err ? (
              <div className="rounded-lg border border-red-700/50 bg-red-900/30 px-3 py-2 text-sm text-red-200">
                {err}
              </div>
            ) : null}
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading || !code}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
        <div className="mt-4 text-center text-sm text-ink-400">
          Admin?{" "}
          <Link href="/admin/login" className="text-accent-300 hover:text-accent-200">
            Admin login
          </Link>
        </div>
      </div>
    </div>
  );
}
