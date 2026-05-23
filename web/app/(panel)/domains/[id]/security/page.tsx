"use client";

import { IconShield } from "../../../../../components/Icon";

export default function SecurityPage() {
  return (
    <div className="card card-pad space-y-3">
      <div className="flex items-center gap-2">
        <IconShield size={16} />
        <h3 className="font-semibold text-ink-100">Security</h3>
      </div>
      <p className="text-sm text-ink-400">
        Reserved for users with Full Domain Access. Future features: WAF rules,
        Rate Limiting, Bot Fight Mode toggles, Workers Routes, and Page Rules.
      </p>
      <div className="text-xs text-ink-500">
        For now, manage Security features directly in the Cloudflare dashboard.
        This panel ensures that every change made there is auditable here once
        the corresponding API integration is added.
      </div>
    </div>
  );
}
