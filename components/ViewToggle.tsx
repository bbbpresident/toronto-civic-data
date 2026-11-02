"use client";
import { useId, useSyncExternalStore } from "react";

// Segmented control that switches between alternate views of the same data (e.g. revenue by
// category vs by program). The views are rendered by the server and passed in, so only the
// switching runs on the client. The choice is remembered per `storageKey` for this browser
// session, so stepping through budget years keeps the view you picked.

export interface View { id: string; label: string; content: React.ReactNode; swatch?: string }

const EVENT = "viewtoggle";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}

function read(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

export default function ViewToggle({ views, label, storageKey, size = "sm" }: {
  views: View[]; label: string; storageKey: string; size?: "sm" | "lg";
}) {
  const base = useId();
  // Server snapshot is null, so the first client render matches the server (first view).
  const saved = useSyncExternalStore(subscribe, () => read(storageKey), () => null);
  const active = saved && views.some(v => v.id === saved) ? saved : views[0].id;
  const lg = size === "lg";

  function choose(id: string) {
    try { sessionStorage.setItem(storageKey, id); } catch { /* storage unavailable — choice lasts this render only */ }
    window.dispatchEvent(new Event(EVENT));
  }

  function onKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = views[(i + (e.key === "ArrowRight" ? 1 : views.length - 1)) % views.length];
    choose(next.id);
    document.getElementById(`${base}-tab-${next.id}`)?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={label} style={{
        display: lg ? "flex" : "inline-flex", flexWrap: lg ? undefined : "wrap", padding: 3, gap: 2, borderRadius: lg ? 12 : 10,
        border: "1px solid var(--border)", background: "var(--background)", margin: lg ? "0 0 14px" : "8px 0 6px",
      }}>
        {views.map((v, i) => {
          const on = v.id === active;
          return (
            <button
              key={v.id}
              id={`${base}-tab-${v.id}`}
              role="tab"
              aria-selected={on}
              aria-controls={`${base}-panel-${v.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(v.id)}
              onKeyDown={e => onKey(e, i)}
              style={{
                flex: lg ? 1 : undefined, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                fontSize: lg ? 14 : 12, fontWeight: lg ? 700 : 600, padding: lg ? "10px 12px" : "6px 12px", lineHeight: 1.25,
                borderRadius: lg ? 9 : 7, border: "none", cursor: "pointer",
                background: on ? "var(--surface-2)" : "transparent",
                color: on ? "var(--text-primary)" : "var(--text-secondary)",
                boxShadow: on ? "0 0 0 1px var(--border)" : "none",
              }}
            >
              {v.swatch && <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: v.swatch, opacity: on ? 1 : 0.5 }} />}
              {v.label}
            </button>
          );
        })}
      </div>
      {views.map(v => (
        <div key={v.id} id={`${base}-panel-${v.id}`} role="tabpanel" aria-labelledby={`${base}-tab-${v.id}`} hidden={v.id !== active}>
          {v.content}
        </div>
      ))}
    </div>
  );
}
