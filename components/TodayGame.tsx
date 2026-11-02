"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DataSourceCitation } from "@/components/SourceCitation";
import type { Level, TodayQuestion } from "@/lib/today";

// TOday: three questions a day, one per level, the same for everyone. Today's questions are picked
// from the generated bank by the date in Toronto; guesses are kept in this browser only.

const LEVELS: Level[] = [1, 2, 3];
const LEVEL_RANGE: Record<Level, string> = { 1: "1 to 10", 2: "1 to 1,000", 3: "No limit" };
const STORAGE_KEY = "today:v1";

// ── Scoring: 1–10 a level, 30 a day ─────────────────────────────────────────

/** Level 1 is scored on distance (each 0.5 off costs a point); levels 2 and 3 on ratio, because
 *  being off by 50 means little at 5,000 and a lot at 60. Level 2 bottoms out at 4× off, level 3 at 10×. */
export function score(level: Level, guess: number, answer: number): number {
  const raw = level === 1
    ? 10 - 2 * Math.abs(guess - answer)
    : 10 - (9 * Math.abs(Math.log(guess / answer))) / Math.log(level === 2 ? 4 : 10);
  return Math.min(10, Math.max(1, Math.round(raw)));
}

const mark = (s: number) => (s === 10 ? "🎯" : s >= 8 ? "🟩" : s >= 5 ? "🟨" : "🟥");

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

/** One question per level for day `n`. Each level is a shuffled queue: every day takes the first
 *  question whose topic and area aren't already used that day and moves it to the back, so nothing
 *  repeats until its level has gone round. Replayed from day 1, so the result depends only on the bank. */
function questionsFor(bank: Record<Level, TodayQuestion[]>, n: number): TodayQuestion[] {
  const queues = LEVELS.map(level => [...bank[level]].sort((a, b) => hash(`${level}:${a.id}`) - hash(`${level}:${b.id}`)));
  let day: TodayQuestion[] = [];
  for (let d = 1; d <= n; d++) {
    const used = new Set<string>();
    day = queues.map(queue => {
      const i = Math.max(0, queue.findIndex(q => !used.has(`t:${q.topic}`) && !used.has(`a:${q.area}`)));
      const [q] = queue.splice(i, 1);
      queue.push(q);
      used.add(`t:${q.topic}`).add(`a:${q.area}`);
      return q;
    });
  }
  return day;
}

// ── Saved plays (this browser only) ─────────────────────────────────────────

type Plays = Record<string, number[]>;

function loadPlays(): Plays {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").plays ?? {}; } catch { return {}; }
}
function savePlays(plays: Plays) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ plays })); } catch { /* private mode: play still works, just isn't kept */ }
}

/** Days in a row finished, ending today (or yesterday, if today isn't finished yet). */
function streak(plays: Plays, today: number): number {
  let d = plays[today]?.length === 3 ? today : today - 1, n = 0;
  while (plays[d]?.length === 3) { n++; d--; }
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

function Guess({ q, onSubmit }: { q: TodayQuestion; onSubmit: (v: number) => void }) {
  const [v1, setV1] = useState(5.5);
  const [text, setText] = useState("");
  const parsed = q.level === 1 ? v1 : parseAmount(text);
  const inRange = parsed != null && parsed >= 1 && (q.level !== 2 || parsed <= 1000) && (q.level !== 1 || parsed <= 10);
  const id = `guess-${q.level}`;
  const affix = (s?: string) => s && <span style={{ fontSize: 22, fontWeight: 700, color: "var(--text-secondary)" }}>{s}</span>;

  return (
    <form onSubmit={e => { e.preventDefault(); if (inRange) onSubmit(parsed!); }} style={{ display: "grid", gap: 12, marginTop: 14 }}>
      <label htmlFor={id} style={{ ...kicker, letterSpacing: "0.04em" }}>Your guess ({LEVEL_RANGE[q.level].toLowerCase()})</label>
      {q.level === 1 ? (
        <>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", textAlign: "center" }} aria-hidden>
            {fmt(q, v1, 1)}
          </div>
          <input id={id} type="range" min={1} max={10} step={0.1} value={v1} onChange={e => setV1(+e.target.value)}
            aria-valuetext={fmt(q, v1, 1)} style={{ width: "100%", accentColor: "var(--blue)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)", marginTop: -6 }}><span>1</span><span>10</span></div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {affix(q.prefix)}
            <input id={id} inputMode={q.level === 2 ? "decimal" : "text"} autoComplete="off" value={text} onChange={e => setText(e.target.value)}
              placeholder={q.level === 2 ? "e.g. 250" : "e.g. 2.5 million"} style={input} />
            {affix(q.suffix)}
          </div>
          {q.level === 2 && (
            <input type="range" aria-label="Guess slider, 1 to 1,000" min={0} max={3} step={0.001}
              value={parsed != null && parsed >= 1 ? Math.min(3, Math.log10(parsed)) : 0}
              onChange={e => { const v = 10 ** +e.target.value; setText(String(v < 10 ? +v.toFixed(1) : Math.round(v))); }}
              style={{ width: "100%", accentColor: "var(--blue)" }} />
          )}
          <div style={{ fontSize: 12, color: "var(--text-secondary)", minHeight: 18 }} aria-live="polite">
            {text.trim() === "" ? (q.level === 3 ? "Shorthand works: 450k, 2.5m, 1.2b." : "")
              : parsed == null ? "That isn't a number we can read."
              : !inRange ? `Enter a number from ${LEVEL_RANGE[q.level].toLowerCase()}.`
              : q.level === 3 ? `= ${fmt(q, parsed, 0)}${parsed >= 1e6 ? ` (${(q.prefix ?? "") + Math.round(parsed).toLocaleString("en-CA")})` : ""}` : ""}
          </div>
        </>
      )}
      <button type="submit" disabled={!inRange} style={{ ...button, opacity: inRange ? 1 : 0.45, cursor: inRange ? "pointer" : "not-allowed", justifySelf: "start" }}>
        Lock it in
      </button>
    </form>
  );
}

// ── The reveal: three columns, one at a time ────────────────────────────────

const GUESS = "#ef4444";
const GRADES: [number, string, string][] = [
  [30, "A+", "A perfect day."], [26, "A", "You know this city."], [22, "B", "Solid."],
  [18, "C", "Not bad at all."], [13, "D", "Now you know a bit more."], [0, "F", "Tomorrow's a new day."],
];
const grade = (total: number) => GRADES.find(([min]) => total >= min)!;

/** Wait before each step: per column, the guess mark, the rise, the score; then the grade. */
const STEP_MS = [500, 700, 1600, 450, 700, 1600, 450, 700, 1600, 700];
const LAST_STEP = STEP_MS.length;
const RISE_MS = 1400;

function niceCeil(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(m => m * p).find(x => x >= v)!;
}

/** Axis labels: $1.2B, 450K, 7.5× */
function compact(q: TodayQuestion, v: number): string {
  const a = Math.abs(v);
  const body = a >= 1e9 ? `${+(v / 1e9).toFixed(1)}B` : a >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : a >= 1e4 ? `${+(v / 1e3).toFixed(0)}K` : `${+v.toFixed(1)}`;
  return `${q.prefix ?? ""}${body}${q.suffix ?? ""}`;
}

function Column({ n, q, guess, step }: { n: number; q: TodayQuestion; guess: number; step: number }) {
  const base = 3 * n;
  const showGuess = step > base, risen = step > base + 1, scored = step > base + 2;
  const top = q.level === 1 ? 10 : niceCeil(Math.max(guess, q.answer) * 1.1);
  const pct = (v: number) => `${(v / top) * 100}%`;
  const s = score(q.level, guess, q.answer);
  const tickStyle: React.CSSProperties = { position: "absolute", left: 0, transform: "translateY(50%)", fontSize: 9, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  return (
    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: "stretch" }}
      aria-label={scored ? `Question ${n + 1}: answer ${fmt(q, q.answer)}, you said ${fmt(q, guess, q.level === 1 ? 1 : 0)}, ${s} out of 10` : undefined}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Q{n + 1}</div>
        <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{LEVEL_RANGE[q.level]}</div>
      </div>
      <div aria-hidden style={{ position: "relative", height: 220, marginLeft: 4 }}>
        {[0, 0.5, 1].map(f => (
          <div key={f}>
            <div style={{ position: "absolute", left: 30, right: 0, bottom: `${f * 100}%`, height: 1, background: "var(--border)" }} />
            <span style={{ ...tickStyle, bottom: `${f * 100}%` }}>{compact(q, top * f)}</span>
          </div>
        ))}
        <div style={{ position: "absolute", left: 30, right: 0, top: 0, bottom: 0, display: "flex", justifyContent: "center" }}>
          {/* The answer: rises from the bottom of the scale. */}
          <div style={{
            position: "absolute", bottom: 0, width: "46%", maxWidth: 44, borderRadius: "4px 4px 0 0", background: "var(--s1)",
            height: risen ? pct(q.answer) : "0%", transition: `height ${RISE_MS}ms cubic-bezier(.25,.8,.25,1)`,
          }} />
          {/* The guess: a red mark across the column. */}
          <div style={{
            position: "absolute", left: 0, right: 0, bottom: pct(Math.min(guess, top)), height: 3, marginBottom: -1.5, borderRadius: 2,
            background: GUESS, boxShadow: "0 0 0 2px var(--surface)", opacity: showGuess ? 1 : 0, transform: showGuess ? "scaleX(1)" : "scaleX(0.3)",
            transition: "opacity 300ms, transform 300ms",
          }} />
        </div>
      </div>
      <div style={{ textAlign: "center", marginTop: 10, minHeight: 74, display: "grid", gap: 2, alignContent: "start" }}>
        <div style={{ fontSize: 12, color: GUESS, fontWeight: 700, opacity: showGuess ? 1 : 0, transition: "opacity 300ms", overflowWrap: "anywhere" }}>
          You: {fmt(q, guess, q.level === 1 ? 1 : 0)}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, opacity: risen ? 1 : 0, transition: `opacity 400ms ${RISE_MS - 300}ms`, overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>
          {fmt(q, q.answer)}
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, opacity: scored ? 1 : 0, transform: scored ? "scale(1)" : "scale(0.6)", transition: "opacity 250ms, transform 250ms" }}>
          {mark(s)} {s}/10
        </div>
      </div>
    </div>
  );
}

function Results({ day, qs, guesses, plays, animate }: { day: number; qs: TodayQuestion[]; guesses: number[]; plays: Plays; animate: boolean }) {
  const [step, setStep] = useState(() => (animate ? 0 : LAST_STEP));
  const [run, setRun] = useState(0);
  const scores = qs.map((q, i) => score(q.level, guesses[i], q.answer));
  const total = scores.reduce((a, b) => a + b, 0);
  const [, letter, line] = grade(total);
  const done = step >= LAST_STEP;

  useEffect(() => {
    if (step >= LAST_STEP) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setStep(x => (still ? LAST_STEP : x + 1)), still ? 0 : STEP_MS[step]);
    return () => clearTimeout(t);
  }, [step, run]);

  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  const text = `TOday #${day} · ${letter} · ${total}/30\n${scores.map(mark).join(" ")}\n${typeof window !== "undefined" ? `${window.location.origin}/today` : ""}`;

  async function share() {
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* share sheet dismissed */ }
  }
  const s = streak(plays, day);

  return (
    <>
      <section style={card} aria-label="Your answers against the real ones">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
          <span style={kicker}>The answers</span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)", display: "flex", gap: 12 }}>
            <span><span style={{ display: "inline-block", width: 12, height: 3, background: GUESS, verticalAlign: "middle", marginRight: 4 }} />You</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--s1)", borderRadius: 2, verticalAlign: "middle", marginRight: 4 }} />Answer</span>
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          {qs.map((q, i) => <Column key={`${q.id}-${run}`} n={i} q={q} guess={guesses[i]} step={step} />)}
        </div>
        <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "10px 0 0", lineHeight: 1.5 }}>Each column has its own scale, starting at zero.</p>
      </section>

      <section style={{ ...card, textAlign: "center", padding: "22px 18px", opacity: done ? 1 : 0, transform: done ? "none" : "translateY(8px)", transition: "opacity 400ms, transform 400ms" }}
        aria-live="polite" aria-hidden={!done}>
        {done && <>
          <div style={kicker}>Today&apos;s grade</div>
          <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1.05, margin: "6px 0 0" }}>{letter}</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {total}<span style={{ color: "var(--text-secondary)" }}>/30</span> <span style={{ letterSpacing: 4, marginLeft: 6 }}>{scores.map(mark).join("")}</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>
            {line} {s > 1 && <>🔥 {s}-day streak. </>}New questions in {untilMidnight(now)}.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 14 }}>
            <button type="button" onClick={share} style={button}>{copied ? "Copied" : "Share your score"}</button>
            <button type="button" onClick={() => { setStep(0); setRun(r => r + 1); }}
              style={{ ...button, background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
              Replay the reveal
            </button>
          </div>
        </>}
      </section>

      {done && qs.map((q, i) => <Details key={q.id} n={i} q={q} guess={guesses[i]} />)}
    </>
  );
}

/** One question's answer in words, with its fact, a link into the site and its sources. */
function Details({ n, q, guess }: { n: number; q: TodayQuestion; guess: number }) {
  const s = score(q.level, guess, q.answer);
  const exact = q.answer >= 1e6 ? `${q.prefix ?? ""}${Math.round(q.answer).toLocaleString("en-CA")}` : null;
  return (
    <details className="td-reveal" style={card}>
      <summary style={{ listStyle: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: 14, lineHeight: 1.45 }}><strong>Q{n + 1}.</strong> {q.prompt}</span>
        <span style={{ fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{s}/10 ▾</span>
      </summary>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 20px", alignItems: "baseline", marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Answer</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{fmt(q, q.answer)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>You said</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: GUESS, fontVariantNumeric: "tabular-nums" }}>{fmt(q, guess, q.level === 1 ? 1 : 0)}</div>
        </div>
      </div>
      {exact && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Exactly {exact}</div>}
      <p style={{ fontSize: 13, margin: "10px 0 0", lineHeight: 1.55 }}>{q.fact}</p>
      <div style={{ marginTop: 10, fontSize: 13 }}>
        <Link href={q.href} style={{ color: "var(--blue)", fontWeight: 600 }}>{q.hrefLabel} →</Link>
      </div>
      <details style={{ marginTop: 10 }}>
        <summary style={{ fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>Where this answer comes from</summary>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0", lineHeight: 1.5 }}>How it was worked out: {q.how}</p>
        <div style={{ display: "grid", gap: 10 }}>
          {q.sources.map((src, i) => <DataSourceCitation key={`${src.fileUrl}-${i}`} source={src} label={q.sources.length > 1 ? `Source ${i + 1}` : "Source"} />)}
        </div>
      </details>
    </details>
  );
}

export default function TodayGame({ bank, launch }: { bank: Record<Level, TodayQuestion[]>; launch: string }) {
  const [day, setDay] = useState<number | null>(null);
  const [plays, setPlays] = useState<Plays>({});
  const topRef = useRef<HTMLDivElement>(null);
  /** Only a game finished on this visit plays the reveal; reopening the page shows the result. */
  const [finishedNow, setFinishedNow] = useState(false);

  // The date and saved plays exist only in the browser, so the game renders after mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDay(dayNumber(launch, new Date()));
    setPlays(loadPlays());
  }, [launch]);

  const qs = useMemo(() => (day == null ? [] : questionsFor(bank, day)), [bank, day]);
  const guesses = day == null ? [] : plays[day] ?? [];

  if (day == null) return <div style={{ ...card, color: "var(--text-secondary)", fontSize: 13 }}>Loading today&apos;s questions…</div>;

  function answer(v: number) {
    const next: Plays = { ...plays, [day!]: [...guesses, v] };
    if (next[day!].length === 3) setFinishedNow(true);
    setPlays(next);
    savePlays(next);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const current = guesses.length < 3 ? qs[guesses.length] : null;
  return (
    <div ref={topRef} style={{ display: "grid", gap: 12, scrollMarginTop: 16 }}>
      <style>{`.td-reveal > summary::-webkit-details-marker{display:none}`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "var(--text-secondary)" }}>
        <span>Game #{day}</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }} aria-label={current ? `Question ${guesses.length + 1} of 3` : "Done for today"}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{
              width: 26, height: 6, borderRadius: 3,
              background: i < guesses.length ? "var(--blue)" : i === guesses.length && current ? "var(--text-secondary)" : "var(--border)",
            }} />
          ))}
        </span>
      </div>
      {current ? (
        <section style={card} aria-labelledby="td-q">
          <div style={kicker}>Question {guesses.length + 1} of 3 · {LEVEL_RANGE[current.level]}</div>
          <h2 id="td-q" style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.4, margin: "8px 0 0" }}>{current.prompt}</h2>
          <Guess key={current.id} q={current} onSubmit={answer} />
          {guesses.length > 0 && (
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "14px 0 0" }}>
              Locked in: {guesses.map((g, i) => `Q${i + 1} ${fmt(qs[i], g, qs[i].level === 1 ? 1 : 0)}`).join(" · ")}. Answers at the end.
            </p>
          )}
        </section>
      ) : (
        <Results day={day} qs={qs} guesses={guesses} plays={plays} animate={finishedNow} />
      )}
    </div>
  );
}
