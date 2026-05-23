export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-ink-300 text-sm">
      <span className="spinner" /> {label ?? "Loading..."}
    </div>
  );
}
