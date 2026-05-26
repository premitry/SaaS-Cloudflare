import { useEffect, useState } from "react";
import { ApiError, auth, getActor, type StoredActor } from "../lib/api";
import { useToast } from "../components/Toast";

export default function SettingsPage() {
  const toast = useToast();
  const [actor, setActor] = useState<StoredActor | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmNext, setConfirmNext] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setActor(getActor());
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirmNext) {
      toast.error("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      await auth.changePassword(current, next);
      toast.success("Password updated");
      setCurrent("");
      setNext("");
      setConfirmNext("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <header>
        <h1 className="text-xl font-semibold text-ink-100">Settings</h1>
        <p className="text-sm text-ink-400 mt-1">Account preferences and security.</p>
      </header>

      <div className="card card-pad space-y-3">
        <h2 className="font-semibold text-ink-100">Profile</h2>
        <div className="text-sm text-ink-300">
          Signed in as{" "}
          <span className="text-ink-100 font-medium">
            {actor?.type === "admin"
              ? `Admin: ${actor.username}`
              : actor?.type === "user"
              ? `User: ${actor.login_code}`
              : "..."}
          </span>
        </div>
      </div>

      {actor?.type === "admin" && (
        <form onSubmit={onSave} className="card card-pad space-y-3">
          <h2 className="font-semibold text-ink-100">Change Password</h2>
          <div>
            <label className="label">Current Password</label>
            <input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div>
            <label className="label">New Password</label>
            <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input type="password" className="input" value={confirmNext} onChange={(e) => setConfirmNext(e.target.value)} required />
          </div>
          <div>
            <button type="submit" className="btn-primary" disabled={submitting || !current || !next || next.length < 8}>
              {submitting ? "Saving..." : "Update password"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
