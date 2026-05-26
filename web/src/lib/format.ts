export function formatDate(s: string | null | undefined): string {
  if (!s) return "-";
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

export function relTime(s: string | null | undefined): string {
  if (!s) return "-";
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

export function classNames(
  ...cs: Array<string | undefined | false | null>
): string {
  return cs.filter(Boolean).join(" ");
}
