import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, api } from "../lib/api";
import { useToast } from "../components/Toast";
import Modal from "../components/Modal";
import Spinner from "../components/Spinner";
import Toggle from "../components/Toggle";
import {
  IconEdit,
  IconPlus,
  IconSearch,
  IconTrash,
} from "../components/Icon";

type DnsRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  comment?: string | null;
};

const TYPES = ["A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV", "CAA"];

export default function DomainDNS() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [list, setList] = useState<DnsRecord[] | null>(null);
  const [q, setQ] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<DnsRecord | null>(null);

  async function load() {
    try {
      const r = await api.get<DnsRecord[]>(`/api/domains/${id}/dns`);
      setList(r);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Load failed");
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !list) return list ?? [];
    return list.filter((r) =>
      r.name.toLowerCase().includes(s) ||
      r.content.toLowerCase().includes(s) ||
      r.type.toLowerCase().includes(s)
    );
  }, [list, q]);

  async function onDelete(r: DnsRecord) {
    if (!confirm(`Delete ${r.type} ${r.name}?`)) return;
    try {
      await api.del(`/api/domains/${id}/dns/${r.id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  async function onToggleProxy(r: DnsRecord, v: boolean) {
    try {
      await api.put(`/api/domains/${id}/dns/${r.id}`, {
        type: r.type, name: r.name, content: r.content, ttl: r.ttl, proxied: v,
      });
      toast.success(`Proxy ${v ? "enabled" : "disabled"}`);
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative w-full sm:w-72">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500"><IconSearch size={14} /></span>
          <input className="input pl-9" placeholder="Filter name, content, type..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={() => { setEditing(null); setOpenForm(true); }}>
          <IconPlus size={14} /> Add Record
        </button>
      </div>

      <div className="card overflow-hidden">
        {list === null ? <div className="p-6"><Spinner /></div> :
          filtered.length === 0 ? <div className="p-8 text-center text-ink-400 text-sm">No records.</div> :
          <table className="table">
            <thead>
              <tr><th>Type</th><th>Name</th><th>Content</th><th>TTL</th><th>Proxy</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td><span className="badge-gray font-mono">{r.type}</span></td>
                  <td className="font-mono text-ink-100">{r.name}</td>
                  <td className="font-mono text-ink-300 break-all max-w-md">{r.content}</td>
                  <td className="text-ink-400 text-xs">{r.ttl === 1 ? "Auto" : r.ttl}</td>
                  <td>
                    {["A", "AAAA", "CNAME"].includes(r.type) ?
                      <Toggle checked={r.proxied} onChange={(v) => onToggleProxy(r, v)} /> :
                      <span className="text-xs text-ink-500">N/A</span>}
                  </td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <button className="btn-secondary" onClick={() => { setEditing(r); setOpenForm(true); }}><IconEdit size={14} /></button>
                      <button className="btn-danger" onClick={() => onDelete(r)}><IconTrash size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>

      {openForm && (
        <DnsForm domainId={id ?? ""} editing={editing}
          onClose={() => setOpenForm(false)}
          onSaved={() => { setOpenForm(false); load(); }} />
      )}
    </div>
  );
}

function DnsForm({ domainId, editing, onClose, onSaved }: {
  domainId: string;
  editing: DnsRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [type, setType] = useState(editing?.type ?? "A");
  const [name, setName] = useState(editing?.name ?? "");
  const [content, setContent] = useState(editing?.content ?? "");
  const [ttl, setTtl] = useState<number>(editing?.ttl ?? 1);
  const [proxied, setProxied] = useState(editing?.proxied ?? false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        type, name, content, ttl,
        proxied: ["A", "AAAA", "CNAME"].includes(type) ? proxied : false,
      };
      if (editing) {
        await api.put(`/api/domains/${domainId}/dns/${editing.id}`, body);
        toast.success("Record updated");
      } else {
        await api.post(`/api/domains/${domainId}/dns`, body);
        toast.success("Record created");
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const proxyable = ["A", "AAAA", "CNAME"].includes(type);

  return (
    <Modal open={true} onClose={onClose} title={editing ? "Edit DNS Record" : "Add DNS Record"}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={onSubmit} disabled={submitting || !name || !content}>
            {submitting ? "Saving..." : editing ? "Save" : "Create"}
          </button>
        </>
      }>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">TTL (1 = auto)</label>
            <input type="number" className="input" value={ttl} min={1} onChange={(e) => setTtl(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="label">Name</label>
          <input className="input font-mono" value={name} onChange={(e) => setName(e.target.value)} placeholder="@ or sub.example.com" />
        </div>
        <div>
          <label className="label">Content</label>
          <input className="input font-mono" value={content} onChange={(e) => setContent(e.target.value)}
            placeholder={type === "MX" ? "10 mail.example.com" : type === "TXT" ? '"v=spf1 -all"' : "203.0.113.42"} />
        </div>
        {proxyable && (
          <div className="flex items-center gap-3">
            <Toggle checked={proxied} onChange={setProxied} />
            <span className="text-sm text-ink-200">Proxy through Cloudflare</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
