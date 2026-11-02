"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DataSourceCitation } from "@/components/SourceCitation";
import type { Level, TodayQuestion } from "@/lib/today";
import { TIERS, mark, score, tierOf } from "@/lib/today-rules";

// TOday: five questions a day, one per level (answers 1–10, –100, –1,000, –10,000, uncapped), 60
// seconds each, the same for everyone. Up to 1,000 points a question, 5,000 a day, and a tier.
// Today's questions are picked from the generated bank by the date in Toronto; guesses and the
// question timers are kept in this browser only.

const LEVELS: Level[] = [1, 2, 3, 4, 5];
const LEVEL_RANGE: Record<Level, string> = { 1: "1 to 10", 2: "1 to 100", 3: "1 to 1,000", 4: "1 to 10,000", 5: "No limit" };
const LEVEL_MAX: Record<Level, number | null> = { 1: 10, 2: 100, 3: 1000, 4: 10000, 5: null };
const SECONDS = 60;
const MAX = 5000;
const STORAGE_KEY = "today:v2";

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

// ── Saved plays and timers (this browser only) ──────────────────────────────

/** day → guesses so far (null = time ran out with nothing entered); day → when each question was first shown. */
interface Saved { plays: Record<string, (number | null)[]>; starts: Record<string, number[]> }

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { plays: v.plays ?? {}, starts: v.starts ?? {} };
  } catch { return { plays: {}, starts: {} }; }
}
function save(s: Saved) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* private mode: play still works, just isn't kept */ }
}

/** Days in a row finished, ending today (or yesterday, if today isn't finished yet). */
function streak(plays: Saved["plays"], today: number): number {
  let d = plays[today]?.length === 5 ? today : today - 1, n = 0;
  while (plays[d]?.length === 5) { n++; d--; }
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
const fmtGuess = (q: TodayQuestion, g: number | null) => (g == null ? "No answer" : fmt(q, g, q.level === 1 || q.suffix === "%" ? 1 : 0));

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

/** One question's input with its 60-second clock. When time runs out, whatever valid answer is entered is
 *  submitted (the 1–10 slider always has one); otherwise the question is submitted with no answer. */
function Guess({ q, startedAt, onSubmit }: { q: TodayQuestion; startedAt: number; onSubmit: (v: number | null) => void }) {
  const [v1, setV1] = useState(5.5);
  const [text, setText] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const max = LEVEL_MAX[q.level];
  const parsed = q.level === 1 ? v1 : parseAmount(text);
  const inRange = parsed != null && parsed >= 1 && (max == null || parsed <= max);
  const left = Math.max(0, SECONDS - Math.floor((now - startedAt) / 1000));
  const done = useRef(false);
  const submit = (v: number | null) => { if (!done.current) { done.current = true; onSubmit(v); } };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left === 0 && !done.current) { done.current = true; onSubmit(inRange ? parsed : null); }
  }, [left, inRange, parsed, onSubmit]);

  const id = `guess-${q.level}`;
  const affix = (s?: string) => s && <span style={{ fontSize: 22, fontWeight: 700, color: "var(--text-secondary)" }}>{s}</span>;
  const urgent = left <= 10;

  return (
    <form onSubmit={e => { e.preventDefault(); if (inRange) submit(parsed!); }} style={{ display: "grid", gap: 12, marginTop: 14 }}>
      <div role="timer" aria-live={urgent ? "assertive" : "off"} aria-label={`${left} seconds left`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div aria-hidden style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(left / SECONDS) * 100}%`, background: urgent ? "#ef4444" : "var(--blue)", transition: "width 250ms linear" }} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: urgent ? "#ef4444" : "var(--text-primary)", minWidth: 34, textAlign: "right" }}>{left}s</span>
      </div>
      <label htmlFor={id} style={{ ...kicker, letterSpacing: "0.04em" }}>Your guess ({LEVEL_RANGE[q.level].toLowerCase()})</label>
      {q.level === 1 ? (
        <>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", textAlign: "center" }} aria-hidden>{fmt(q, v1, 1)}</div>
          <input id={id} type="range" min={1} max={10} step={0.1} value={v1} onChange={e => setV1(+e.target.value)}
            aria-valuetext={fmt(q, v1, 1)} style={{ width: "100%", accentColor: "var(--blue)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)", marginTop: -6 }}><span>1</span><span>10</span></div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {affix(q.prefix)}
            <input id={id} autoFocus inputMode={q.level <= 3 ? "decimal" : "text"} autoComplete="off" value={text} onChange={e => setText(e.target.value)}
              placeholder={q.level === 2 ? "e.g. 45" : q.level === 3 ? "e.g. 250" : q.level === 4 ? "e.g. 2,500" : "e.g. 2.5 million"} style={input} />
            {affix(q.suffix)}
          </div>
          {max != null && (
            <input type="range" aria-label={`Guess slider, ${LEVEL_RANGE[q.level]}`} min={0} max={Math.log10(max)} step={0.001}
              value={parsed != null && parsed >= 1 ? Math.min(Math.log10(max), Math.log10(parsed)) : 0}
              onChange={e => { const v = 10 ** +e.target.value; setText(String(v < 10 ? +v.toFixed(1) : Math.round(v))); }}
              style={{ width: "100%", accentColor: "var(--blue)" }} />
          )}
          <div style={{ fontSize: 12, color: "var(--text-secondary)", minHeight: 18 }} aria-live="polite">
            {text.trim() === "" ? (q.level >= 4 ? "Shorthand works: 4.5k, 2.5m, 1.2b." : "")
              : parsed == null ? "That isn't a number we can read."
              : !inRange ? `Enter a number from ${LEVEL_RANGE[q.level].toLowerCase()}.`
              : parsed >= 1000 ? `= ${fmt(q, parsed, 0)}` : ""}
          </div>
        </>
      )}
      <button type="submit" disabled={!inRange} style={{ ...button, opacity: inRange ? 1 : 0.45, cursor: inRange ? "pointer" : "not-allowed", justifySelf: "start" }}>
        Lock it in
      </button>
    </form>
  );
}

// ── The ending: climb the CN Tower ──────────────────────────────────────────

/** The tower's silhouette in a 120 × 400 box: antenna, SkyPod, main pod, the tapering shaft and its base. */
function TowerShape() {
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

const STEP_MS = 1500;

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

function Results({ day, qs, guesses, plays, animate }: { day: number; qs: TodayQuestion[]; guesses: (number | null)[]; plays: Saved["plays"]; animate: boolean }) {
  const scores = qs.map((q, i) => score(q.level, guesses[i], q.answer));
  const total = scores.reduce((a, b) => a + b, 0);
  const tier = tierOf(total);
  // step k (0–5): k questions scored; 6: the tier is shown.
  const [step, setStep] = useState(() => (animate ? 0 : 6));
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (step >= 6) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setStep(x => (still ? 6 : x + 1)), still ? 0 : step === 0 ? 500 : STEP_MS);
    return () => clearTimeout(t);
  }, [step, run]);
  const scored = Math.min(step, 5);
  const climbed = scores.slice(0, scored).reduce((a, b) => a + b, 0);
  const done = step >= 6;

  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  const text = `TOday #${day} · ${tier.name} · ${total.toLocaleString("en-CA")}/5,000\n${scores.map(mark).join("")}\n${typeof window !== "undefined" ? `${window.location.origin}/today` : ""}`;
  async function share() {
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* share sheet dismissed */ }
  }
  const s = streak(plays, day);

  return (
    <>
      <section style={{ ...card, padding: "20px 18px" }} aria-label="Your score">
        <div style={{ textAlign: "center", minHeight: 96, opacity: done ? 1 : 0, transform: done ? "none" : "translateY(6px)", transition: "opacity 400ms, transform 400ms" }} aria-live="polite">
          {done && <>
            <div style={kicker}>Today&apos;s tier</div>
            <div style={{ fontSize: "clamp(26px, 7vw, 40px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "4px 0" }}>{tier.name}</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>{tier.line}</div>
          </>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(90px, 150px) minmax(0, 1fr)", gap: 16, alignItems: "end", marginTop: 8 }}>
          <div>
            <Tower key={run} fill={climbed} tierLine={done ? total : null} />
            <div style={{ textAlign: "center", marginTop: 6, fontSize: 20, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
              {climbed.toLocaleString("en-CA")}<span style={{ fontSize: 12, color: "var(--text-secondary)" }}> / 5,000</span>
            </div>
          </div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {qs.map((q, i) => {
              const shown = i < scored;
              return (
                <li key={`${q.id}-${run}`} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", background: "var(--surface-2)",
                  opacity: shown ? 1 : 0.25, transform: shown ? "none" : "translateX(6px)", transition: "opacity 350ms, transform 350ms" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontSize: 12, fontWeight: 800 }}>Q{i + 1} <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>{LEVEL_RANGE[q.level]}</span></span>
                    <span style={{ fontSize: 13, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{shown ? `+${scores[i].toLocaleString("en-CA")}` : "…"}</span>
                  </div>
                  {shown && (
                    <div style={{ fontSize: 12, marginTop: 2, display: "flex", flexWrap: "wrap", gap: "0 10px", fontVariantNumeric: "tabular-nums" }}>
                      <span>Answer <strong>{fmt(q, q.answer)}</strong></span>
                      <span style={{ color: "#ef4444" }}>You {fmtGuess(q, guesses[i])}</span>
                    </div>
                  )}
                </li>
              );
            })}
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

      {done && qs.map((q, i) => <Details key={q.id} n={i} q={q} guess={guesses[i]} points={scores[i]} />)}
    </>
  );
}

/** One question's answer in words, with its fact, a link into the site and its sources. */
function Details({ n, q, guess, points }: { n: number; q: TodayQuestion; guess: number | null; points: number }) {
  const exact = q.answer >= 1e6 ? `${q.prefix ?? ""}${Math.round(q.answer).toLocaleString("en-CA")}` : null;
  return (
    <details className="td-reveal" style={card}>
      <summary style={{ listStyle: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: 14, lineHeight: 1.45 }}><strong>Q{n + 1}.</strong> {q.prompt}</span>
        <span style={{ fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{points.toLocaleString("en-CA")} ▾</span>
      </summary>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 20px", alignItems: "baseline", marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Answer</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{fmt(q, q.answer)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>You said</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#ef4444", fontVariantNumeric: "tabular-nums" }}>{fmtGuess(q, guess)}</div>
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
  const [saved, setSaved] = useState<Saved>({ plays: {}, starts: {} });
  /** Only a game finished on this visit plays the climb; reopening the page shows the result. */
  const [finishedNow, setFinishedNow] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  // The date and saved plays exist only in the browser, so the game renders after mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDay(dayNumber(launch, new Date()));
    setSaved(load());
  }, [launch]);

  const qs = useMemo(() => (day == null ? [] : questionsFor(bank, day)), [bank, day]);
  const guesses = day == null ? [] : saved.plays[day] ?? [];
  const current = day != null && guesses.length < 5 ? qs[guesses.length] : null;
  const startedAt = day != null && current ? saved.starts[day]?.[guesses.length] : undefined;

  // Start the current question's clock the first time it's shown (kept, so reloading doesn't reset it).
  useEffect(() => {
    if (day == null || !current || startedAt != null) return;
    const next: Saved = { ...saved, starts: { ...saved.starts, [day]: [...(saved.starts[day] ?? []), Date.now()] } };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(next);
    save(next);
  }, [day, current, startedAt, saved]);

  if (day == null) return <div style={{ ...card, color: "var(--text-secondary)", fontSize: 13 }}>Loading today&apos;s questions…</div>;

  function answer(v: number | null) {
    const next: Saved = { ...saved, plays: { ...saved.plays, [day!]: [...guesses, v] } };
    if (next.plays[day!].length === 5) setFinishedNow(true);
    setSaved(next);
    save(next);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div ref={topRef} style={{ display: "grid", gap: 12, scrollMarginTop: 16 }}>
      <style>{`.td-reveal > summary::-webkit-details-marker{display:none}`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "var(--text-secondary)" }}>
        <span>Game #{day}</span>
        <span style={{ display: "flex", gap: 5, alignItems: "center" }} aria-label={current ? `Question ${guesses.length + 1} of 5` : "Done for today"}>
          {LEVELS.map((_, i) => (
            <span key={i} style={{ width: 20, height: 6, borderRadius: 3,
              background: i < guesses.length ? "var(--blue)" : i === guesses.length && current ? "var(--text-secondary)" : "var(--border)" }} />
          ))}
        </span>
      </div>
      {current ? (
        <section style={card} aria-labelledby="td-q">
          <div style={kicker}>Question {guesses.length + 1} of 5 · {LEVEL_RANGE[current.level]}</div>
          <h2 id="td-q" style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.4, margin: "8px 0 0" }}>{current.prompt}</h2>
          {startedAt != null && <Guess key={current.id} q={current} startedAt={startedAt} onSubmit={answer} />}
          {guesses.length > 0 && (
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "14px 0 0" }}>
              Locked in: {guesses.map((g, i) => `Q${i + 1} ${fmtGuess(qs[i], g)}`).join(" · ")}. Answers at the end.
            </p>
          )}
        </section>
      ) : (
        <Results day={day} qs={qs} guesses={guesses} plays={saved.plays} animate={finishedNow} />
      )}
    </div>
  );
}
