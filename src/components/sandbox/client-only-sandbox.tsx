'use client';

import { useEffect, useState } from 'react';

import { SandboxMount } from './sandbox-mount';

/**
 * Mount a sandbox on the client only.
 *
 * Why this exists, on the public simulator index specifically:
 *
 * These are interactive calculators. Server-rendering their computed state
 * buys nothing — there is no SEO value in an apogee figure that changes the
 * moment a visitor touches a slider, and no first-paint benefit either,
 * because the numbers are meaningless until the controls are usable.
 *
 * What it costs is a hydration surface. Six independent simulators, each
 * recomputing on mount, is six chances for a server-rendered string to differ
 * from its client-rendered counterpart by a rounding step, a locale detail or
 * a text-node boundary. React reacts to any one of those by throwing away the
 * server HTML for that subtree — so the "benefit" of SSR is discarded anyway,
 * and the visitor gets a console error for it.
 *
 * A lesson page mounts exactly one sandbox alongside content that genuinely
 * should be server-rendered, and those pages hydrate clean; they keep using
 * `SandboxMount` directly. This wrapper is for the index, where the sandboxes
 * are the entire payload and none of them benefit from being pre-rendered.
 *
 * The placeholder is sized to roughly match so the page does not jump.
 */
export function ClientOnlySandbox({ simulationKey }: { simulationKey: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className="flex min-h-[420px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)]"
        aria-busy="true"
      >
        <p className="text-sm text-[var(--text-muted)]">Loading the simulator…</p>
      </div>
    );
  }

  return <SandboxMount simulationKey={simulationKey} />;
}
