import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, api } from "../lib/api";
import { useToast } from "../components/Toast";
import Toggle from "../components/Toggle";
import Modal from "../components/Modal";
import Spinner from "../components/Spinner";
import { IconMail, IconPlus, IconTrash } from "../components/Icon";

type Settings = { enabled?: boolean; status?: string };
type Rule = {
  id: string;
  name?: string;
  enabled: boolean;
  matchers: Array<{ type: string; field?: string; value?: string }>;
  actions: Array<{ type: string; value?: string[] }>;
  priority?: number;
  tag?: string;
};
type CatchAll = {
  id?: string;
  enabled?: boolean;
  matchers?: Array<{ type: string }>;
  actions?: Array<{ type: string; value?: string[] }>;
};
type Bundle = {
  settings: Settings | null;
  rules: Rule[];
  catch_all: CatchAll | null;
};

export default function DomainEmailRouting() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [data, setData] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [openAdd, setOpenAdd] = useState(false);

  async function load() {
    try {
      setData(await api.get<Bundle>(`/api/domains/${id}/email-routing`));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onToggleRouting(v: boolean) {
    try {
      await api.post(`/api/domains/${id}/email-routing/${v ? "enable" : "disable"}`);
      toast.success(`Routing ${v ? "enabled" : "disabled"}`);
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed");
    }
  }
  async function onCatchAll(enabled: boolean, forwardTo?: string) {
    try {
      await api.put(`/api/domains/${id}/email-routing/catch-all`, { enabled, forward_to: forwardTo });
      toast.success("Catch-all updated");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed");
    }
  }
  async function onDeleteRule(r: Rule) {
    if (!confirm(`Delete rule ${r.name ?? r.id}?`)) return;
    try {
      await api.del(`/api/domains/${id}/email-routing/rules/${r.id}`);
      toast.success("Rule deleted");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed");
    }
  }
  async function onToggleRule(r: Rule, v: boolean) {
    try {
      await api.put(`/api/domains/${id}/email-routing/rules/${r.id}`, { ...r, enabled: v });
      toast.success(`Rule ${v ? "enabled" : "disabled"}`);
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed");
    }
  }

  if (loading) return <Spinner />;
  if (!data) return null;

  const enabled = !!data.settings?.enabled || data.settings?.status === "ready";
  const caEnabled = !!data.catch_all?.enabled;
  const caForward = data.catch_all?.actions?.find((a) => a.type === "forward")?.value?.[0] ?? "";

  return (
    <div className="space-y-4">
      <div className="card card-pad space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-ink-100 flex items-center gap-2">
              <IconMail size={14} /> Enable Routing
            </div>
            <div className="text-xs text-ink-400 mt-0.5">
              Cloudflare must verify your MX records to deliver email.
            </div>
          </div>
          <Toggle checked={enabled} onChange={onToggleRouting} />
        </div>
        {enabled && <CatchAllRow enabled={caEnabled} forwardTo={caForward} onSave={onCatchAll} />}
      </div>

      {enabled && (
        <div className="card overflow-hidden">
          <header className="flex items-center justify-between px-5 py-3 border-b border-ink-700">
            <h3 className="font-semibold text-ink-100">Forwarding Rules</h3>
            <button className="btn-primary" onClick={() => setOpenAdd(true)}>
              <IconPlus size={14} /> Add Rule
            </button>
          </header>
          {data.rules.length === 0 ? <div className="p-8 text-center text-ink-400 text-sm">No rules yet.</div> :
            <table className="table">
              <thead>
                <tr><th>Match</th><th>Forward To</th><th>Enabled</th><th></th></tr>
              </thead>
              <tbody>
                {data.rules.map((r) => {
                  const match = r.matchers?.[0]?.value ?? (r.matchers?.[0]?.type === "all" ? "* (all)" : "-");
                  const forward = r.actions?.find((a) => a.type === "forward")?.value ?? [];
                  return (
                    <tr key={r.id}>
                      <td className="font-mono text-ink-100">{match}</td>
                      <td className="font-mono text-ink-300">{forward.join(", ") || "(drop)"}</td>
                      <td><Toggle checked={r.enabled} onChange={(v) => onToggleRule(r, v)} /></td>
                      <td className="text-right"><button className="btn-danger" onClick={() => onDeleteRule(r)}><IconTrash size={14} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          }
        </div>
      )}

      {openAdd && (
        <RuleForm domainId={id ?? ""} onClose={() => setOpenAdd(false)} onSaved={() => { setOpenAdd(false); load(); }} />
      )}
    </div>
  );
}

function CatchAllRow({ enabled, forwardTo, onSave }: {
  enabled: boolean; forwardTo: string; onSave: (enabled: boolean, forwardTo?: string) => void;
}) {
  const [val, setVal] = useState(forwardTo);
  useEffect(() => setVal(forwardTo), [forwardTo]);
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-850 p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-ink-100">Catch-All</div>
          <div className="text-xs text-ink-400 mt-0.5">Forward any unmatched address ({"*@domain"}) to a destination.</div>
        </div>
        <Toggle checked={enabled} onChange={(v) => onSave(v, val || undefined)} />
      </div>
      {enabled && (
        <div className="mt-3 flex items-center gap-2">
          <input className="input flex-1 font-mono" placeholder="destination@gmail.com" value={val} onChange={(e) => setVal(e.target.value)} />
          <button className="btn-primary" disabled={!val} onClick={() => onSave(true, val)}>Save</button>
        </div>
      )}
    </div>
  );
}

function RuleForm({ domainId, onClose, onSaved }: {
  domainId: string; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [match, setMatch] = useState("");
  const [forward, setForward] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setSubmitting(true);
    try {
      await api.post(`/api/domains/${domainId}/email-routing/rules`, { match, forward_to: forward });
      toast.success("Rule created. Verify the destination in Cloudflare to receive mail.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Add Forwarding Rule"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={onSubmit} disabled={submitting || !match || !forward}>
            {submitting ? "Saving..." : "Create"}
          </button>
        </>
      }>
      <div className="space-y-3">
        <div>
          <label className="label">Match (incoming address)</label>
          <input className="input font-mono" placeholder="support@yourdomain.com" value={match} onChange={(e) => setMatch(e.target.value)} />
        </div>
        <div>
          <label className="label">Forward To</label>
          <input className="input font-mono" placeholder="destination@gmail.com" value={forward} onChange={(e) => setForward(e.target.value)} />
          <p className="text-xs text-ink-500 mt-1">The destination must be verified in Cloudflare Email Routing.</p>
        </div>
      </div>
    </Modal>
  );
}
