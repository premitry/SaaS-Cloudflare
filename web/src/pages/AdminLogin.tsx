import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  auth,
  diag,
  formatError,
  setActor,
  setToken,
  type Diag,
} from "../lib/api";
import { IconCloud, IconShield, IconWarn } from "../components/Icon";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<Diag | null>(null);

  useEffect(() => {
    diag
      .check()
      .then((d) => {
        setInfo(d);
        if (!d.db_ready) {
          setHint(
            d.db_error
              ? `Database not ready: ${d.db_error}`
              : "Database not initialised. Run `npm run db:migrate:remote` (or :local)."
          );
        } else if (!d.has_jwt_secret) {
          setHint(
            "JWT_SECRET is not set on the worker. Run `npx wrangler secret put JWT_SECRET` (or `npm run setup` for local)."
          );
        }
      })
      .catch((e) => {
        setHint(`Cannot reach the API: ${formatError(e)}`);
      });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const r = await auth.adminLogin(username.trim(), password);
      setToken(r.token);
      setActor(r.actor);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      setErr(formatError(e));
    } finally {
      setLoading(false);
    }
  }

  const isFresh = info?.db_ready && info.admin_count === 0;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-accent-400 to-accent-700 flex items-center justify-center">
            <IconCloud size={18} />
          </div>
          <span className="font-semibold text-ink-100 text-lg">CF Panel</span>
        </div>

        {hint ? (
          <div className="card card-pad mb-4 border-amber-700/50 bg-amber-900/20">
            <div className="flex items-start gap-2 text-amber-200 text-sm">
              <span className="mt-0.5">
                <IconWarn size={14} />
              </span>
              <span>{hint}</span>
            </div>
          </div>
        ) : null}

        {isFresh ? (
          <div className="card card-pad mb-4 border-accent-700/50 bg-accent-500/5">
            <p className="text-sm text-accent-200">
              Fresh install detected. The first credentials you submit will
              create the initial admin.
            </p>
          </div>
        ) : null}

        <div className="card card-pad space-y-4">
          <div className="flex items-center gap-2">
            <IconShield size={16} />
            <h1 className="text-lg font-semibold text-ink-100">Admin Login</h1>
          </div>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="label">Username</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isFresh ? "new-password" : "current-password"}
                minLength={8}
                required
              />
              <p className="text-xs text-ink-500 mt-1">At least 8 characters.</p>
            </div>
            {err ? (
              <div className="rounded-lg border border-red-700/50 bg-red-900/30 px-3 py-2 text-sm text-red-200">
                {err}
              </div>
            ) : null}
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading || !username || password.length < 8}
            >
              {loading
                ? "Signing in..."
                : isFresh
                ? "Create admin & sign in"
                : "Sign in"}
            </button>
          </form>
          <p className="text-xs text-ink-500 leading-relaxed">
            On a fresh install with no admin yet, the first credentials you
            submit here will create the initial admin account.
          </p>
        </div>
        <div className="mt-4 text-center text-sm text-ink-400">
          Have an access code?{" "}
          <Link to="/login" className="text-accent-300 hover:text-accent-200">
            User login
          </Link>
        </div>
      </div>
    </div>
  );
}
