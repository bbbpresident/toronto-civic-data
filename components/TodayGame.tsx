"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DataSourceCitation } from "@/components/SourceCitation";
import { TimerBar, useCountdown, SECONDS } from "@/components/TodayTimer";
import type { ChoiceQuestion, Level, TodayQuestion } from "@/lib/today";
import { FREE_SECONDS, MAX, TIERS, distanceTo, mapScore, mark, score, speedOf, tierOf, timePenalty } from "@/lib/today-rules";
import MapGuess, { KIND_LABEL, MapReveal, type BlankMapData, type Pt } from "@/components/MapGuess";
import { MAP_ROLL_MS, MapRoll, NumberRoll, numberRollMs } from "@/components/TodayReveal";
import type { DataSource, Place, PlaceKind } from "@/lib/types";

// 416: four questions, six tiers, one minute. Every day: a multiple-choice question, a number from 1 to
// 100, a place to find on the map, and an uncapped number — all on one 60-second clock, the same for
// everyone. Up to 1,000 points a question for accuracy (4,000 a day), times a speed multiplier: ×1 if
// you finish with 20+ seconds left, sliding to ×0.75 at the buzzer (see lib/today-rules). Today's questions are picked from the generated bank by the date in
// Toronto; guesses and the clock are kept in this browser only.

const STORAGE_KEY = "416:v1";
const N = 4;

// ── The day ─────────────────────────────────────────────────────────────────

function torontoDate(d: Date): [number, number, number] {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  return [get("year"), get("month"), get("day")];
}

function dayNumber(launch: string, now: Date): number {
  const [y, m, d] = torontoDate(now), [ly, lm, ld] = launch.split("-").map(Number);
  return Math.max(1, Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ly, lm - 1, ld)) / 864e5) + 1);
}

function untilMidnight(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  const left = 24 * 60 - (get("hour") * 60 + get("minute"));
  return `${Math.floor(left / 60)}h ${left % 60}m`;
}

/** FNV-1a: a stable shuffle key, so the order doesn't depend on the bank's order. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

// ── Items ───────────────────────────────────────────────────────────────────

/** One of a day's four questions. */
export type Item = { type: "choice"; q: ChoiceQuestion } | { type: "number"; q: TodayQuestion } | { type: "map"; place: Place };
/** An option index (choice), a number, a map point, or null for no answer. */
type Answer = number | null | Pt;

/** Kinds of place the map question uses for now, alternating day to day. */
const MAP_KINDS: PlaceKind[] = ["station", "neighbourhood"];

/** `?map` in the address: a test mode of four map questions, random each load, nothing saved. */
const isMapTest = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("map");

interface Bank { choice: ChoiceQuestion[]; levels: Record<Level, TodayQuestion[]> }

/** Day n's questions. Each kind is a shuffled queue: every day takes the first question whose topic and area
 *  aren't already used that day and moves it to the back, so nothing repeats until its queue has gone round.
 *  Replayed from day 1, so the result depends only on the bank. */
function questionsFor(bank: Bank, places: Place[], n: number): Item[] {
  type Q = { id: string; topic: string; area: string };
  const sorted = <T extends Q>(xs: T[], salt: string) => [...xs].sort((a, b) => hash(`${salt}:${a.id}`) - hash(`${salt}:${b.id}`));
  const queues: Q[][] = [sorted(bank.choice, "c"), sorted(bank.levels[2], "2"), sorted(bank.levels[5], "5")];
  let picks: Q[] = [];
  for (let d = 1; d <= n; d++) {
    const used = new Set<string>();
    picks = queues.map(queue => {
      const i = Math.max(0, queue.findIndex(q => !used.has(`t:${q.topic}`) && !used.has(`a:${q.area}`)));
      const [q] = queue.splice(i, 1);
      queue.push(q);
      used.add(`t:${q.topic}`).add(`a:${q.area}`);
      return q;
    });
  }
  const kind = MAP_KINDS[n % MAP_KINDS.length];
  const pool = places.filter(p => p.kind === kind).sort((a, b) => hash(a.id) - hash(b.id));
  return [
    { type: "choice", q: picks[0] as ChoiceQuestion },
    { type: "number", q: picks[1] as TodayQuestion },
    { type: "map", place: pool[Math.floor(n / MAP_KINDS.length) % pool.length] },
    { type: "number", q: picks[2] as TodayQuestion },
  ];
}

function testItems(places: Place[], seed: number): Item[] {
  const order = (kind: PlaceKind) => places.filter(p => p.kind === kind).sort((a, b) => hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`));
  const st = order("station"), nb = order("neighbourhood");
  return [st[0], nb[0], st[1], nb[1]].map(place => ({ type: "map", place }));
}

const itemId = (it: Item) => (it.type === "map" ? it.place.id : it.q.id);
const itemLabel = (it: Item) => (it.type === "choice" ? "Multiple choice" : it.type === "map" ? `Map · ${KIND_LABEL[it.place.kind]}` : it.q.level === 2 ? "1 to 100" : "No limit");
const itemPrompt = (it: Item) => (it.type === "map" ? `Where is ${it.place.name}?` : it.q.prompt);
const kmOff = (place: Place, g: Pt, map: BlankMapData) => distanceTo(g, place) * map.kmPerUnit;

function itemScore(it: Item, g: Answer, map: BlankMapData): number {
  if (it.type === "choice") return g === it.q.correct ? 1000 : 0;
  if (it.type === "number") return score(it.q.level, g as number | null, it.q.answer);
  return mapScore(g == null ? null : kmOff(it.place, g as Pt, map));
}
const fmtAnswer = (it: Item) => (it.type === "choice" ? it.q.options[it.q.correct] : it.type === "number" ? fmt(it.q, it.q.answer) : it.place.name);
function fmtItemGuess(it: Item, g: Answer, map: BlankMapData): string {
  if (g == null) return it.type === "map" ? "No pin" : "No answer";
  if (it.type === "choice") return it.q.options[g as number];
  if (it.type === "number") return fmtGuess(it.q, g as number);
  const km = kmOff(it.place, g as Pt, map);
  return km < 0.15 ? "right on it" : `${km < 10 ? km.toFixed(1) : Math.round(km)} km off`;
}

// ── Saved plays (this browser only) ─────────────────────────────────────────

/** day → answers so far; day → when the clock started; day → when the game ended (ms). */
interface Saved { plays: Record<string, Answer[]>; starts: Record<string, number>; ends: Record<string, number> }
const EMPTY: Saved = { plays: {}, starts: {}, ends: {} };

function load(): Saved {
  if (isMapTest()) return EMPTY;  // test mode keeps nothing
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { plays: v.plays ?? {}, starts: v.starts ?? {}, ends: v.ends ?? {} };
  } catch { return EMPTY; }
}
function save(s: Saved) {
  if (isMapTest()) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* private mode: play still works, just isn't kept */ }
}

/** Days in a row finished, ending today (or yesterday, if today isn't finished yet). */
function streak(plays: Saved["plays"], today: number): number {
  let d = plays[today]?.length === N ? today : today - 1, n = 0;
  while (plays[d]?.length === N) { n++; d--; }
  return n;
}

// ── Numbers ─────────────────────────────────────────────────────────────────

function fmt(q: TodayQuestion, v: number, decimals = q.decimals): string {
  const a = Math.abs(v);
  const body = a >= 1e9 ? `${+(v / 1e9).toFixed(2)} billion`
    : a >= 1e6 ? `${+(v / 1e6).toFixed(2)} million`
    : v.toLocaleString("en-CA", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${q.prefix ?? ""}${body}${q.suffix ?? ""}`;
}
const fmtGuess = (q: TodayQuestion, g: number | null) => (g == null ? "No answer" : fmt(q, g, q.suffix === "%" ? 1 : 0));

const MULT: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mil: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

/** "1.2m", "$450k", "3,000,000", "2.5 billion" → a number; null if it isn't one. */
export function parseAmount(s: string): number | null {
  const m = /^\$?\s*(\d*\.?\d+)\s*([a-z]*)\s*[%×x]?$/i.exec(s.trim().replace(/[,\s](?=\d)/g, ""));
  if (!m) return null;
  const unit = m[2].toLowerCase();
  if (unit && !(unit in MULT)) return null;
  const v = parseFloat(m[1]) * (unit ? MULT[unit] : 1);
  return Number.isFinite(v) ? v : null;
}

// ── UI ──────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 18px 16px" };
const kicker: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-secondary)" };
const button: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, padding: "11px 18px", borderRadius: 10, border: "none", cursor: "pointer",
  background: "var(--blue)", color: "#0b0e15",
};
const input: React.CSSProperties = {
  fontSize: 22, fontWeight: 700, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--text-primary)", width: "100%", minWidth: 0, fontVariantNumeric: "tabular-nums",
};
const GREEN = "#22c55e", RED = "#ef4444";

/** Multiple choice: tapping an option locks it in. */
function ChoiceGuess({ q, onSubmit }: { q: ChoiceQuestion; onSubmit: (v: number) => void }) {
  const done = useRef(false);
  return (
    <div role="group" aria-label="Options" style={{ display: "grid", gap: 8, marginTop: 14 }}>
      {q.options.map((o, i) => (
        <button key={o} type="button" onClick={() => { if (!done.current) { done.current = true; onSubmit(i); } }}
          style={{ textAlign: "left", fontSize: 15, fontWeight: 600, padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)",
            background: "var(--surface-2)", color: "var(--text-primary)", cursor: "pointer" }}>
          <span style={{ color: "var(--text-secondary)", fontWeight: 800, marginRight: 10 }}>{"ABCD"[i]}</span>{o}
        </button>
      ))}
    </div>
  );
}

/** A number answer. `onDraft` tells the game the current valid entry, so it can lock that in if time runs out. */
function Guess({ q, onSubmit, onDraft }: { q: TodayQuestion; onSubmit: (v: number | null) => void; onDraft: (v: number | null) => void }) {
  const [text, setText] = useState("");
  const max = q.level === 2 ? 100 : null;
  const parsed = parseAmount(text);
  const inRange = parsed != null && parsed >= 1 && (max == null || parsed <= max);
  const done = useRef(false);
  useEffect(() => { onDraft(inRange ? parsed : null); }, [inRange, parsed, onDraft]);
  const id = `guess-${q.level}`;
  const affix = (s?: string) => s && <span style={{ fontSize: 22, fontWeight: 700, color: "var(--text-secondary)" }}>{s}</span>;

  return (
    <form onSubmit={e => { e.preventDefault(); if (inRange && !done.current) { done.current = true; onSubmit(parsed!); } }} style={{ display: "grid", gap: 12, marginTop: 14 }}>
      <label htmlFor={id} style={{ ...kicker, letterSpacing: "0.04em" }}>Your guess ({max ? "1 to 100" : "no limit"})</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {affix(q.prefix)}
        <input id={id} autoFocus inputMode={max ? "decimal" : "text"} autoComplete="off" value={text} onChange={e => setText(e.target.value)}
          placeholder={max ? "e.g. 45" : "e.g. 2.5 million"} style={input} />
        {affix(q.suffix)}
      </div>
      {max != null && (
        <input type="range" aria-label="Guess slider, 1 to 100" min={0} max={2} step={0.001}
          value={parsed != null && parsed >= 1 ? Math.min(2, Math.log10(parsed)) : 0}
          onChange={e => { const v = 10 ** +e.target.value; setText(String(v < 10 ? +v.toFixed(1) : Math.round(v))); }}
          style={{ width: "100%", accentColor: "var(--blue)" }} />
      )}
      <div style={{ fontSize: 12, color: "var(--text-secondary)", minHeight: 18 }} aria-live="polite">
        {text.trim() === "" ? (max ? "" : "Shorthand works: 4.5k, 2.5m, 1.2b.")
          : parsed == null ? "That isn't a number we can read."
          : !inRange ? "Enter a number from 1 to 100."
          : parsed >= 1000 ? `= ${fmt(q, parsed, 0)}` : ""}
      </div>
      <button type="submit" disabled={!inRange} style={{ ...button, opacity: inRange ? 1 : 0.45, cursor: inRange ? "pointer" : "not-allowed", justifySelf: "start" }}>
        Lock it in
      </button>
    </form>
  );
}

/** The game clock: one minute for all four questions. */
function Clock({ start, onExpire }: { start: number; onExpire: () => void }) {
  const left = useCountdown(start, onExpire);
  return <TimerBar left={left} />;
}

// ── The ending: climb the CN Tower ──────────────────────────────────────────

/** The tower's silhouette in a 120 × 400 box: antenna, SkyPod, main pod, the tapering shaft and its base. */
export function TowerShape() {
  return (
    <>
      <rect x={58.5} y={6} width={3} height={64} rx={1.5} />
      <rect x={53} y={68} width={14} height={12} rx={4} />
      <rect x={55} y={78} width={10} height={76} />
      <rect x={34} y={150} width={52} height={14} rx={7} />
      <rect x={38} y={162} width={44} height={24} rx={10} />
      <polygon points="53,184 67,184 75,362 45,362" />
      <polygon points="45,360 75,360 88,392 32,392" />
    </>
  );
}

const STEP_MS = 1400, CHOICE_MS = 1900, SPEED_MS = 2000;

function Tower({ fill, tierLine }: { fill: number; tierLine: number | null }) {
  const H = 386, top = 6, y = top + H * (1 - Math.min(1, fill / MAX));
  return (
    <svg viewBox="0 0 120 400" width="100%" style={{ maxWidth: 150, display: "block", margin: "0 auto", overflow: "visible" }} aria-hidden>
      <defs>
        <clipPath id="cn-clip"><TowerShape /></clipPath>
        <linearGradient id="cn-fill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="var(--s1)" />
          <stop offset="1" stopColor="var(--s6)" />
        </linearGradient>
      </defs>
      <g fill="var(--surface-2)" stroke="var(--border)" strokeWidth={1}><TowerShape /></g>
      <g clipPath="url(#cn-clip)">
        <rect x={0} width={120} y={y} height={400 - y} fill="url(#cn-fill)" style={{ transition: `y ${STEP_MS - 300}ms cubic-bezier(.3,.8,.3,1), height ${STEP_MS - 300}ms cubic-bezier(.3,.8,.3,1)` }} />
      </g>
      {TIERS.filter(t => t.min > 0 && t.min < MAX).map(t => {
        const ty = top + H * (1 - t.min / MAX);
        return <line key={t.min} x1={96} x2={tierLine != null && tierLine >= t.min ? 108 : 102} y1={ty} y2={ty} stroke={tierLine != null && tierLine >= t.min ? "var(--s6)" : "var(--border)"} strokeWidth={1.5} />;
      })}
    </svg>
  );
}

/** Reveals a multiple-choice answer: your pick, then the right one. */
function ChoiceRoll({ q, guess }: { q: ChoiceQuestion; guess: number | null }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShown(true), 700); return () => clearTimeout(t); }, []);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {q.options.map((o, i) => {
        const right = shown && i === q.correct, mine = i === guess;
        return (
          <div key={o} style={{ fontSize: 14, padding: "8px 12px", borderRadius: 8, border: `1px solid ${right ? GREEN : mine ? RED : "var(--border)"}`,
            background: right ? "rgba(34,197,94,.15)" : mine ? "rgba(239,68,68,.12)" : "transparent", transition: "all 300ms" }}>
            <strong style={{ marginRight: 8, color: "var(--text-secondary)" }}>{"ABCD"[i]}</strong>{o}
            {mine && <span style={{ float: "right", color: RED, fontWeight: 700, fontSize: 12 }}>your pick</span>}
            {right && <span style={{ float: "right", color: GREEN, fontWeight: 800, fontSize: 12, marginRight: mine ? 8 : 0 }}>✓ answer</span>}
          </div>
        );
      })}
      {guess == null && <div style={{ fontSize: 12, color: RED, fontWeight: 700 }}>No answer</div>}
    </div>
  );
}

function Results({ day, qs, guesses, plays, secondsLeft, animate, map, sources }: {
  day: number; qs: Item[]; guesses: Answer[]; plays: Saved["plays"]; secondsLeft: number; animate: boolean; map: BlankMapData; sources: MapSources;
}) {
  const scores = qs.map((it, i) => itemScore(it, guesses[i], map));
  const accuracy = scores.reduce((a, b) => a + b, 0);
  const penalty = timePenalty(secondsLeft, accuracy);
  const speed = speedOf(secondsLeft);
  const total = accuracy + penalty;
  const tier = tierOf(total);
  // The climb, as steps: step 2i reveals question i, step 2i+1 fills in its card and raises the tower;
  // step 8 shows the speed multiplier, step 9 applies it, step 10 shows the tier.
  const LAST = 10;
  const [step, setStep] = useState(() => (animate ? 0 : LAST));
  const [run, setRun] = useState(0);
  const stepMs = (k: number) => {
    if (k === 8) return SPEED_MS;
    if (k % 2) return STEP_MS;
    const it = qs[k / 2];
    return it.type === "map" ? MAP_ROLL_MS : it.type === "choice" ? CHOICE_MS : numberRollMs(it.q.answer, it.q.decimals);
  };
  useEffect(() => {
    if (step >= LAST) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setStep(x => (still ? LAST : x + 1)), still ? 0 : stepMs(step) + (step === 0 ? 300 : 0));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, run]);
  const scored = Math.min(N, Math.ceil(Math.min(step, 8) / 2));
  const climbed = scores.slice(0, scored).reduce((a, b) => a + b, 0) + (step >= 9 ? penalty : 0);
  const done = step >= LAST;
  const revealing = !done && step < 8 && step % 2 === 0 ? step / 2 : null;
  const stageItem = revealing != null ? qs[revealing] : null;

  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  const text = `416 #${day} · ${tier.name} · ${total.toLocaleString("en-CA")}/4,000\n${scores.map(mark).join("")} ⏱ ${secondsLeft.toFixed(0)}s left\n${typeof window !== "undefined" ? `${window.location.origin}/today` : ""}`;
  async function share() {
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* share sheet dismissed */ }
  }
  const s = streak(plays, day);
  const stage = { border: "1px solid var(--border)", borderRadius: 12, padding: "12px 12px 14px", background: "var(--surface-2)", marginBottom: 12 } as const;

  return (
    <>
      <section style={{ ...card, padding: "20px 18px" }} aria-label="Your score">
        <div style={{ textAlign: "center", minHeight: done ? 96 : 0, opacity: done ? 1 : 0, transform: done ? "none" : "translateY(6px)", transition: "opacity 400ms, transform 400ms" }} aria-live="polite">
          {done && <>
            <div style={kicker}>Today&apos;s tier</div>
            <div style={{ fontSize: "clamp(26px, 7vw, 40px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "4px 0" }}>{tier.name}</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>{tier.line}</div>
          </>}
        </div>
        {stageItem && (
          <div key={`${revealing}-${run}`} style={stage}>
            <div style={{ ...kicker, marginBottom: 6 }}>Q{revealing! + 1} · {itemPrompt(stageItem)}</div>
            {stageItem.type === "choice" ? <ChoiceRoll q={stageItem.q} guess={guesses[revealing!] as number | null} />
              : stageItem.type === "number" ? <NumberRoll guess={guesses[revealing!] as number | null} answer={stageItem.q.answer} decimals={stageItem.q.decimals} prefix={stageItem.q.prefix} suffix={stageItem.q.suffix} />
              : <MapRoll place={stageItem.place} guess={guesses[revealing!] as Pt | null} map={map} />}
          </div>
        )}
        {step === 8 && (
          <div key={`bonus-${run}`} style={{ ...stage, textAlign: "center" }}>
            <div style={{ ...kicker, marginBottom: 6 }}>Speed</div>
            <div style={{ fontSize: "clamp(28px, 8vw, 44px)", fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>⏱ {secondsLeft.toFixed(1)}s left</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {speed >= 1 ? <>Done with {FREE_SECONDS}+ seconds to spare: <strong style={{ color: GREEN }}>you keep every point</strong></>
                : <>× {speed.toFixed(2)} speed → <strong style={{ color: RED }}>{penalty.toLocaleString("en-CA")}</strong></>}
            </div>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(90px, 150px) minmax(0, 1fr)", gap: 16, alignItems: "end", marginTop: 8 }}>
          <div>
            <Tower key={run} fill={climbed} tierLine={done ? total : null} />
            <div style={{ textAlign: "center", marginTop: 6, fontSize: 20, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
              {climbed.toLocaleString("en-CA")}<span style={{ fontSize: 12, color: "var(--text-secondary)" }}> / 4,000</span>
            </div>
          </div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {qs.map((it, i) => {
              const shown = i < scored;
              return (
                <li key={`${itemId(it)}-${run}`} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", background: "var(--surface-2)",
                  opacity: shown ? 1 : 0.25, transform: shown ? "none" : "translateX(6px)", transition: "opacity 350ms, transform 350ms" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontSize: 12, fontWeight: 800 }}>Q{i + 1} <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>{itemLabel(it)}</span></span>
                    <span style={{ fontSize: 13, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{shown ? `+${scores[i].toLocaleString("en-CA")}` : "…"}</span>
                  </div>
                  {shown && (
                    <div style={{ fontSize: 12, marginTop: 2, display: "flex", flexWrap: "wrap", gap: "0 10px", fontVariantNumeric: "tabular-nums" }}>
                      <span>Answer <strong>{fmtAnswer(it)}</strong></span>
                      <span style={{ color: RED }}>You {fmtItemGuess(it, guesses[i], map)}</span>
                    </div>
                  )}
                </li>
              );
            })}
            <li style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", background: "var(--surface-2)",
              opacity: step >= 9 ? 1 : 0.25, transition: "opacity 350ms" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <span style={{ fontSize: 12, fontWeight: 800 }}>⏱ Speed <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>{step >= 9 ? `${secondsLeft.toFixed(1)}s left · ×${speed.toFixed(2)}` : ""}</span></span>
                <span style={{ fontSize: 13, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{step >= 9 ? (penalty ? penalty.toLocaleString("en-CA") : "±0") : "…"}</span>
              </div>
            </li>
          </ol>
        </div>
      </section>

      {done && (
        <section style={{ ...card, textAlign: "center" }}>
          <div style={{ fontSize: 22, letterSpacing: 4 }} aria-label={scores.map((x, i) => `Question ${i + 1}: ${x} points`).join(", ")}>{scores.map(mark).join("")}</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
            {s > 1 && <>🔥 {s}-day streak. </>}New questions in {untilMidnight(now)}.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 12 }}>
            <button type="button" onClick={share} style={button}>{copied ? "Copied" : "Share your score"}</button>
            <button type="button" onClick={() => { setStep(0); setRun(r => r + 1); }}
              style={{ ...button, background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
              Replay the climb
            </button>
          </div>
        </section>
      )}

      {done && qs.map((it, i) => it.type === "choice"
        ? <ChoiceDetails key={it.q.id} n={i} q={it.q} guess={guesses[i] as number | null} points={scores[i]} />
        : it.type === "number"
          ? <Details key={it.q.id} n={i} q={it.q} guess={guesses[i] as number | null} points={scores[i]} />
          : <MapDetails key={it.place.id} n={i} place={it.place} guess={guesses[i] as Pt | null} points={scores[i]} map={map} sources={sources} />)}
    </>
  );
}

function Sources({ how, sources }: { how: string; sources: DataSource[] }) {
  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>Where this answer comes from</summary>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0", lineHeight: 1.5 }}>How it was worked out: {how}</p>
      <div style={{ display: "grid", gap: 10 }}>
        {sources.map((src, i) => <DataSourceCitation key={`${src.fileUrl}-${i}`} source={src} label={sources.length > 1 ? `Source ${i + 1}` : "Source"} />)}
      </div>
    </details>
  );
}

const summaryRow = (n: number, prompt: React.ReactNode, points: number) => (
  <summary style={{ listStyle: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
    <span style={{ fontSize: 14, lineHeight: 1.45 }}><strong>Q{n + 1}.</strong> {prompt}</span>
    <span style={{ fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{points.toLocaleString("en-CA")} ▾</span>
  </summary>
);

function ChoiceDetails({ n, q, guess, points }: { n: number; q: ChoiceQuestion; guess: number | null; points: number }) {
  return (
    <details className="td-reveal" style={card}>
      {summaryRow(n, q.prompt, points)}
      <div style={{ fontSize: 14, marginTop: 10 }}>
        <span style={{ color: GREEN, fontWeight: 800 }}>✓ {q.options[q.correct]}</span>
        {guess != null && guess !== q.correct && <span style={{ color: RED, fontWeight: 700 }}> · you picked {q.options[guess]}</span>}
        {guess == null && <span style={{ color: RED, fontWeight: 700 }}> · no answer</span>}
      </div>
      <p style={{ fontSize: 13, margin: "8px 0 0", lineHeight: 1.55 }}>{q.fact}</p>
      <div style={{ marginTop: 10, fontSize: 13 }}><Link href={q.href} style={{ color: "var(--blue)", fontWeight: 600 }}>{q.hrefLabel} →</Link></div>
      <Sources how={q.how} sources={q.sources} />
    </details>
  );
}

/** One number question's answer in words, with its fact, a link into the site and its sources. */
function Details({ n, q, guess, points }: { n: number; q: TodayQuestion; guess: number | null; points: number }) {
  const exact = q.answer >= 1e6 ? `${q.prefix ?? ""}${Math.round(q.answer).toLocaleString("en-CA")}` : null;
  return (
    <details className="td-reveal" style={card}>
      {summaryRow(n, q.prompt, points)}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 20px", alignItems: "baseline", marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Answer</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{fmt(q, q.answer)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>You said</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: RED, fontVariantNumeric: "tabular-nums" }}>{fmtGuess(q, guess)}</div>
        </div>
      </div>
      {exact && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Exactly {exact}</div>}
      <p style={{ fontSize: 13, margin: "10px 0 0", lineHeight: 1.55 }}>{q.fact}</p>
      <div style={{ marginTop: 10, fontSize: 13 }}><Link href={q.href} style={{ color: "var(--blue)", fontWeight: 600 }}>{q.hrefLabel} →</Link></div>
      <Sources how={q.how} sources={q.sources} />
    </details>
  );
}

interface MapSources { place: Record<PlaceKind, DataSource>; outline: DataSource }

/** The map question's answer: where the place is, how far off the pin was, and the sources. */
function MapDetails({ n, place, guess, points, map, sources }: { n: number; place: Place; guess: Pt | null; points: number; map: BlankMapData; sources: MapSources }) {
  return (
    <details className="td-reveal" style={card} open>
      {summaryRow(n, <>Where is {place.name}? <span style={{ color: "var(--text-secondary)" }}>({KIND_LABEL[place.kind]})</span></>, points)}
      <div style={{ fontSize: 13, marginTop: 8 }}>
        <span style={{ color: GREEN, fontWeight: 700 }}>{place.name}</span>{" "}·{" "}
        <span style={{ color: RED, fontWeight: 700 }}>your pin: {fmtItemGuess({ type: "map", place }, guess, map)}</span>
        {place.rings ? <span style={{ color: "var(--text-secondary)" }}> (anywhere inside the green area counts as on target)</span> : null}
      </div>
      <MapReveal place={place} map={map} guess={guess} />
      <details style={{ marginTop: 10 }}>
        <summary style={{ fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>Where this answer comes from</summary>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0", lineHeight: 1.5 }}>
          Scored by distance: 1,000 within 150 m (or inside the area), about 780 at 1 km, 370 at 4 km, 80 at 10 km.
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          <DataSourceCitation source={sources.place[place.kind]} label="Location" />
          <DataSourceCitation source={sources.outline} label="Map outline" />
        </div>
      </details>
    </details>
  );
}

export default function TodayGame({ bank, launch, map, places, sources }: {
  bank: Bank; launch: string; map: BlankMapData; places: Place[]; sources: MapSources;
}) {
  const [day, setDay] = useState<number | null>(null);
  const [test, setTest] = useState<{ seed: number } | null>(null);
  const [saved, setSaved] = useState<Saved>(EMPTY);
  /** Only a game finished on this visit plays the climb; reopening the page shows the result. */
  const [finishedNow, setFinishedNow] = useState(false);
  const draft = useRef<Answer>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // The date and saved plays exist only in the browser, so the game renders after mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDay(dayNumber(launch, new Date()));
    setSaved(load());
    if (isMapTest()) setTest({ seed: Date.now() });
  }, [launch]);

  const qs = useMemo<Item[]>(() => {
    if (day == null) return [];
    return test ? testItems(places, test.seed) : questionsFor(bank, places, day);
  }, [bank, day, places, test]);
  const guesses = day == null ? [] : saved.plays[day] ?? [];
  const start = day != null ? saved.starts[day] : undefined;
  const current = day != null && start != null && guesses.length < N ? qs[guesses.length] : null;

  const commit = useCallback((next: Saved, finished: boolean) => {
    if (finished) setFinishedNow(true);
    setSaved(next);
    save(next);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  function begin() {
    const next: Saved = { ...saved, starts: { ...saved.starts, [day!]: Date.now() } };
    setSaved(next); save(next);
  }

  function answer(v: Answer) {
    draft.current = null;
    const plays = [...guesses, v], finished = plays.length === N;
    commit({ ...saved, plays: { ...saved.plays, [day!]: plays }, ends: finished ? { ...saved.ends, [day!]: Date.now() } : saved.ends }, finished);
  }

  /** Time's up: lock in whatever's entered on the current question; the rest get no answer. */
  const expire = useCallback(() => {
    if (day == null || start == null) return;
    setSaved(prev => {
      const done = prev.plays[day] ?? [];
      if (done.length >= N) return prev;
      const plays = [...done, draft.current, ...Array(N - done.length - 1).fill(null)];
      const next: Saved = { ...prev, plays: { ...prev.plays, [day]: plays }, ends: { ...prev.ends, [day]: start + SECONDS * 1000 } };
      save(next);
      return next;
    });
    setFinishedNow(true);
  }, [day, start]);
  const setDraft = useCallback((v: Answer) => { draft.current = v; }, []);

  if (day == null) return <div style={{ ...card, color: "var(--text-secondary)", fontSize: 13 }}>Loading today&apos;s questions…</div>;

  const finished = guesses.length >= N;
  const secondsLeft = finished && start != null ? Math.max(0, Math.min(SECONDS, (start + SECONDS * 1000 - (saved.ends[day] ?? start + SECONDS * 1000)) / 1000)) : 0;

  return (
    <div ref={topRef} style={{ display: "grid", gap: 12, scrollMarginTop: 16 }}>
      <style>{`.td-reveal > summary::-webkit-details-marker{display:none}`}</style>
      {test && (
        <div role="note" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px",
          borderRadius: 10, border: "1px dashed var(--s6)", fontSize: 13, color: "var(--text-secondary)" }}>
          <span><strong style={{ color: "var(--text-primary)" }}>Map test mode:</strong> four map questions, a new random set each time. Nothing is saved.</span>
          <button type="button" onClick={() => window.location.reload()}
            style={{ fontSize: 13, fontWeight: 700, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", cursor: "pointer" }}>
            New set
          </button>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "var(--text-secondary)" }}>
        <span>416 · Game #{day}</span>
        <span style={{ display: "flex", gap: 5, alignItems: "center" }} aria-label={current ? `Question ${guesses.length + 1} of ${N}` : finished ? "Done for today" : "Not started"}>
          {Array.from({ length: N }, (_, i) => (
            <span key={i} style={{ width: 24, height: 6, borderRadius: 3,
              background: i < guesses.length ? "var(--blue)" : i === guesses.length && current ? "var(--text-secondary)" : "var(--border)" }} />
          ))}
        </span>
      </div>

      {start == null && !finished ? (
        <section style={{ ...card, textAlign: "center", padding: "26px 18px" }}>
          <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.04em" }}>416</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>4 questions · 1 minute · 6ix tiers</div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "10px auto 0", maxWidth: 440, lineHeight: 1.55 }}>
            A multiple-choice question, a number from 1 to 100, a spot on the map, and a number with no limit. The clock starts when you press Start and
            runs across all four. Closer answers climb higher; finish with 20 seconds to spare and you keep every point.
          </p>
          <button type="button" onClick={begin} style={{ ...button, marginTop: 16, fontSize: 17, padding: "12px 28px" }}>Start</button>
        </section>
      ) : current ? (
        <section style={card} aria-labelledby="td-q">
          <Clock key={start} start={start!} onExpire={expire} />
          <div style={{ ...kicker, marginTop: 12 }}>Question {guesses.length + 1} of {N} · {itemLabel(current)}</div>
          <h2 id="td-q" style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.4, margin: "8px 0 0" }}>
            {current.type === "map" ? <>Where is <span style={{ color: "var(--blue)" }}>{current.place.name}</span>? Drop a pin on the map.</> : current.q.prompt}
          </h2>
          {current.type === "choice" && <ChoiceGuess key={current.q.id} q={current.q} onSubmit={answer} />}
          {current.type === "number" && <Guess key={current.q.id} q={current.q} onSubmit={answer} onDraft={setDraft} />}
          {current.type === "map" && <MapGuess key={current.place.id} place={current.place} map={map} onSubmit={answer} onDraft={setDraft} />}
          {guesses.length > 0 && (
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "14px 0 0" }}>
              Locked in: {guesses.map((g, i) => `Q${i + 1} ${qs[i].type === "map" ? (g == null ? "no pin" : "pin dropped") : fmtItemGuess(qs[i], g, map)}`).join(" · ")}. Answers at the end.
            </p>
          )}
        </section>
      ) : (
        <Results day={day} qs={qs} guesses={guesses} plays={saved.plays} secondsLeft={secondsLeft} animate={finishedNow} map={map} sources={sources} />
      )}
    </div>
  );
}
