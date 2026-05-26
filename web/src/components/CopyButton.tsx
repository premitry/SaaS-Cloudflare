import { useState } from "react";
import { IconCheck, IconCopy } from "./Icon";

export default function CopyButton({
  value,
  label = "COPY",
}: {
  value: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800
                 px-2 py-1 text-xs font-medium text-ink-200 hover:bg-ink-700"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* ignore */
        }
      }}
    >
      {done ? <IconCheck size={14} /> : <IconCopy size={14} />}
      {done ? "COPIED" : label}
    </button>
  );
}
