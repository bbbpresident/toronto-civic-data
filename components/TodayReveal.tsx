"use client";

import { useEffect, useState } from "react";
import { MapLayers, Pin, type BlankMapData, type Pt } from "@/components/MapGuess";
import { nearest } from "@/lib/today-rules";
import type { Place } from "@/lib/types";

// TOday's answer reveals, played one question at a time before each result card fills in:
//  - NumberRoll: starts on the player's number, then turns into the answer one digit at a time,
//    from the last digit to the first.
//  - MapRoll: the player's pin, then a dotted line drawing itself to the answer while a kilometre
//    counter runs up to the distance; the answer lands at the end.

const DIGIT_MS = 170, NUMBER_TAIL_MS = 700, LINE_MS = 1900, MAP_TAIL_MS = 800;
const RED = "#ef4444", GREEN = "#22c55e";

function full(v: number, decimals: number, prefix = "", suffix = ""): string {
  return `${prefix}${v.toLocaleString("en-CA", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
}

const digitCount = (s: string) => s.replace(/\D/g, "").length;

/** How long a reveal runs, so the results can wait for it before moving on. */
export function numberRollMs(answer: number, decimals: number): number {
  return digitCount(full(answer, decimals)) * DIGIT_MS + NUMBER_TAIL_MS;
}
export const MAP_ROLL_MS = LINE_MS + MAP_TAIL_MS;

/** One frame counter for the animations (a requestAnimationFrame clock in ms since start). */
function useElapsed(): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0, start = 0;
    const tick = (now: number) => { if (!start) start = now; setT(now - start); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

export function NumberRoll({ guess, answer, decimals, prefix, suffix }: { guess: number | null; answer: number; decimals: number; prefix?: string; suffix?: string }) {
  const t = useElapsed();
  const target = full(answer, decimals, prefix, suffix);
  const start = guess == null ? target.replace(/\d/g, "–") : full(guess, decimals, prefix, suffix);
  const len = Math.max(target.length, start.length);
  const T = target.padStart(len, " "), G = start.padStart(len, " ");
  const locked = Math.min(digitCount(target), Math.floor(t / DIGIT_MS));   // digits settled, counted from the right
  // Each digit of the answer gets a rank from the right (0 = last digit).
  const rank: number[] = [];
  for (let i = len - 1, r = 0; i >= 0; i--) rank[i] = /\d/.test(T[i]) ? r++ : -1;
  const settledFrom = (i: number) => { // a separator settles once every digit to its right has
    for (let j = i + 1; j < len; j++) if (rank[j] >= 0) return rank[j] < locked;
    return locked > 0;
  };
  const done = locked >= digitCount(target);
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 12, color: RED, fontWeight: 700 }}>You said {guess == null ? "nothing" : start}</div>
      <div aria-hidden style={{ fontSize: "clamp(30px, 9vw, 52px)", fontWeight: 900, letterSpacing: "0.02em", fontVariantNumeric: "tabular-nums", whiteSpace: "pre", margin: "4px 0", minHeight: "1.2em" }}>
        {T.split("").map((ch, i) => {
          if (rank[i] >= 0) {
            if (rank[i] < locked) return <span key={i} style={{ color: "var(--text-primary)" }}>{ch}</span>;
            if (rank[i] === locked) return <span key={i} style={{ color: "var(--s6)" }}>{Math.floor(t / 45 + i * 3) % 10}</span>;
            return <span key={i} style={{ color: RED }}>{G[i]}</span>;
          }
          return <span key={i} style={{ color: settledFrom(i) ? "var(--text-primary)" : RED }}>{settledFrom(i) ? ch : G[i]}</span>;
        })}
      </div>
      <div style={{ fontSize: 12, color: done ? GREEN : "var(--text-secondary)", fontWeight: 700 }} aria-live="polite">{done ? `Answer: ${target}` : "Revealing the answer…"}</div>
    </div>
  );
}

export function MapRoll({ place, guess, map }: { place: Place; guess: Pt | null; map: BlankMapData }) {
  const t = useElapsed();
  const p = Math.min(1, t / LINE_MS), eased = 1 - Math.pow(1 - p, 3);
  const hit = guess ? nearest(guess, place) : null;
  const km = hit ? hit.d * map.kmPerUnit : 0;
  const tip: Pt | null = guess && hit ? [guess[0] + (hit.at[0] - guess[0]) * eased, guess[1] + (hit.at[1] - guess[1]) * eased] : null;
  const landed = p >= 1;

  // Frame the guess and the answer together (with room around them), keeping the map's shape.
  const anchor = place.point ?? hit?.at ?? [map.width / 2, map.height / 2];
  const pts = [anchor, ...(guess ? [guess] : []), ...(place.rings?.flat() ?? [])];
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  const aspect = map.width / map.height;
  let w = Math.max(260, (Math.max(...xs) - Math.min(...xs)) * 1.5), h = Math.max(w / aspect, (Math.max(...ys) - Math.min(...ys)) * 1.5);
  w = Math.min(map.width, Math.max(w, h * aspect)); h = w / aspect;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const vx = Math.max(0, Math.min(map.width - w, cx - w / 2)), vy = Math.max(0, Math.min(map.height - h, cy - h / 2));
  const k = w / map.width; // keep pins and lines the same size on screen whatever the zoom

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 6 }} aria-live="polite">
        <span style={{ fontSize: "clamp(28px, 8vw, 44px)", fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
          {guess ? (km * eased).toFixed(1) : "—"}
        </span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-secondary)" }}> km off</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: landed ? GREEN : "var(--text-secondary)", minHeight: 18 }}>
          {landed ? (guess && km < 0.15 ? `Right on ${place.name}!` : place.name) : guess ? "Measuring…" : "No pin dropped"}
        </div>
      </div>
      <svg viewBox={`${vx} ${vy} ${w} ${h}`} width="100%" role="img" aria-label={`${place.name}${guess ? `, ${km.toFixed(1)} km from your pin` : ""}`}
        style={{ display: "block", borderRadius: 12, border: "1px solid var(--border)" }}>
        <MapLayers map={map} />
        {landed && place.rings && (
          <g fill={GREEN} fillOpacity={0.4} stroke={GREEN} strokeWidth={2.5 * k}>{place.rings.map((r, i) => <path key={i} d={`M${r.map(q => q.join(",")).join("L")}Z`} />)}</g>
        )}
        {guess && tip && <line x1={guess[0]} y1={guess[1]} x2={tip[0]} y2={tip[1]} stroke="var(--text-primary)" strokeWidth={3 * k} strokeDasharray={`${8 * k} ${7 * k}`} strokeLinecap="round" />}
        {landed && place.point && <Pin at={place.point} color={GREEN} r={10 * k} />}
        {guess && <Pin at={guess} color={RED} r={10 * k} />}
      </svg>
    </div>
  );
}
