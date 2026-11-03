"use client";

import { useEffect, useRef, useState } from "react";

// TOday's per-question clock, shared by the number and map questions. The start time comes from
// localStorage (set when the question is first shown), so reloading the page doesn't reset it.

export const SECONDS = 60;

/** Seconds left; calls onExpire once when the clock reaches zero. */
export function useCountdown(startedAt: number, onExpire: () => void): number {
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, SECONDS - Math.floor((now - startedAt) / 1000));
  const fired = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left === 0 && !fired.current) { fired.current = true; onExpire(); }
  }, [left, onExpire]);
  return left;
}

export function TimerBar({ left }: { left: number }) {
  const urgent = left <= 10;
  return (
    <div role="timer" aria-live={urgent ? "assertive" : "off"} aria-label={`${left} seconds left`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div aria-hidden style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(left / SECONDS) * 100}%`, background: urgent ? "#ef4444" : "var(--blue)", transition: "width 250ms linear" }} />
      </div>
      <span style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: urgent ? "#ef4444" : "var(--text-primary)", minWidth: 34, textAlign: "right" }}>{left}s</span>
    </div>
  );
}
