"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CityEvent } from "@/lib/types";

// The City's Festivals & Events calendar as a month grid. "Today" is the reader's date in Toronto, so
// it's worked out in the browser; the events themselves are the stored snapshot (lib/city.json).

export type CalEvent = Pick<CityEvent, "name" | "url" | "category" | "free" | "where" | "start" | "end">;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export function torontoToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const longDate = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });

function useToday(fallback: string) {
  const [today, setToday] = useState(fallback);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setToday(torontoToday()), []);
  return today;
}

function MonthGrid({ year, month, from, to, counts, today, selected, onPick, compact }: {
  year: number; month: number; from: string; to: string; counts: Record<string, number>; today: string; selected?: string;
  onPick: (d: string) => void; compact?: boolean;
}) {
  const first = new Date(year, month, 1).getDay(), n = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const size = compact ? 30 : 44;
  return (
    <div role="grid" aria-label={`${MONTHS[month]} ${year}`} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: compact ? 3 : 4 }}>
      {DOW.map((d, i) => <div key={i} role="columnheader" aria-hidden style={{ fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", textAlign: "center", paddingBottom: 2 }}>{d}</div>)}
      {cells.map((d, i) => {
        if (d == null) return <div key={i} />;
        const day = iso(year, month, d), c = counts[day] ?? 0, inWindow = day >= from && day <= to;
        const isToday = day === today, isSel = day === selected, past = day < today;
        const label = `${MONTHS[month]} ${d}: ${c ? `${c} event${c === 1 ? "" : "s"}` : "no events listed"}${isToday ? " (today)" : ""}`;
        return (
          <button key={i} type="button" role="gridcell" aria-label={label} aria-selected={isSel} disabled={!inWindow} onClick={() => onPick(day)}
            style={{
              all: "unset", boxSizing: "border-box", cursor: inWindow ? "pointer" : "default", height: size, borderRadius: 8, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 2, fontSize: compact ? 12 : 13, fontVariantNumeric: "tabular-nums",
              background: isSel ? "var(--blue)" : c ? "var(--surface-2)" : "transparent", color: isSel ? "#0b0e15" : past || !inWindow ? "var(--text-secondary)" : "var(--text-primary)",
              opacity: inWindow ? 1 : 0.35, outline: isToday && !isSel ? "2px solid var(--blue)" : undefined, outlineOffset: -2, fontWeight: isToday ? 800 : 500,
            }}>
            {d}
            {c > 0 && (compact
              ? <span aria-hidden style={{ width: 5, height: 5, borderRadius: 3, background: isSel ? "#0b0e15" : "var(--s6)" }} />
              : <span aria-hidden style={{ fontSize: 9, fontWeight: 700, color: isSel ? "#0b0e15" : "var(--s6)" }}>{c}</span>)}
          </button>
        );
      })}
    </div>
  );
}

function EventRow({ e, fallbackUrl }: { e: CalEvent; fallbackUrl: string }) {
  return (
    <li style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <a href={e.url ?? fallbackUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>{e.name} ↗</a>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, display: "flex", flexWrap: "wrap", gap: "2px 10px" }}>
        {e.category && <span>{e.category}</span>}
        {e.where && <span>{e.where}</span>}
        {e.free && <span style={{ color: "var(--s3)", fontWeight: 700 }}>Free</span>}
      </div>
    </li>
  );
}

/** Full calendar for /events: month navigation within the stored window, and the chosen day's events. */
export default function EventsCalendar({ from, to, items, days, calendarUrl }: {
  from: string; to: string; items: CalEvent[]; days: Record<string, number[]>; calendarUrl: string;
}) {
  const today = useToday(from);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("d");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(d && d >= from && d <= to ? d : torontoToday() >= from ? torontoToday() : from);
  }, [from, to]);
  const sel = selected ?? today;
  const [ym, setYm] = useState<[number, number] | null>(null);
  const shown = ym ?? [Number(sel.slice(0, 4)), Number(sel.slice(5, 7)) - 1];
  const counts = useMemo(() => Object.fromEntries(Object.entries(days).map(([d, ix]) => [d, ix.length])), [days]);
  const minYm = [Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1], maxYm = [Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1];
  const at = (y: number, m: number) => y * 12 + m;
  const step = (dir: number) => { const t = at(shown[0], shown[1]) + dir; setYm([Math.floor(t / 12), t % 12]); };
  const list = (days[sel] ?? []).map(i => items[i]);

  const navBtn = (dir: number, label: string, disabled: boolean) => (
    <button type="button" onClick={() => step(dir)} disabled={disabled} aria-label={label}
      style={{ fontSize: 16, width: 34, height: 34, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1 }}>
      {dir < 0 ? "‹" : "›"}
    </button>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 20, alignItems: "start" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          {navBtn(-1, "Previous month", at(shown[0], shown[1]) <= at(minYm[0], minYm[1]))}
          <strong style={{ fontSize: 16 }}>{MONTHS[shown[1]]} {shown[0]}</strong>
          {navBtn(1, "Next month", at(shown[0], shown[1]) >= at(maxYm[0], maxYm[1]))}
        </div>
        <MonthGrid year={shown[0]} month={shown[1]} from={from} to={to} counts={counts} today={today} selected={sel}
          onPick={d => { setSelected(d); history.replaceState(null, "", `?d=${d}`); }} />
      </div>
      <section aria-live="polite" aria-label="Events on the chosen day">
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: "4px 0 2px" }}>{longDate(sel)}{sel === today ? " · today" : ""}</h2>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 6px" }}>
          {list.length ? `${list.length} event${list.length === 1 ? "" : "s"}` : "Nothing listed for this day."} Longer-running exhibitions and programs are listed below the calendar.
        </p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{list.map((e, i) => <EventRow key={`${e.name}-${i}`} e={e} fallbackUrl={calendarUrl} />)}</ul>
      </section>
    </div>
  );
}

/** Compact month calendar for the home page: dots on days with events, and what's coming up. */
export function MiniCalendar({ from, to, items, days }: { from: string; to: string; items: CalEvent[]; days: Record<string, number[]> }) {
  const today = useToday(from);
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1;
  const counts = useMemo(() => Object.fromEntries(Object.entries(days).map(([d, ix]) => [d, ix.length])), [days]);
  const upcoming = useMemo(() => Object.keys(days).filter(d => d >= today).sort().slice(0, 3)
    .flatMap(d => days[d].slice(0, 2).map(i => ({ d, e: items[i] }))).slice(0, 4), [days, items, today]);
  return (
    <div>
      <MonthGrid year={y} month={m} from={from} to={to} counts={counts} today={today} compact
        onPick={d => { window.location.href = `/events?d=${d}`; }} />
      <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }}>
        {upcoming.map(({ d, e }, i) => (
          <li key={i} style={{ fontSize: 12, lineHeight: 1.35, display: "flex", gap: 8, minWidth: 0 }}>
            <span style={{ color: "var(--s6)", fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
              {d === today ? "Today" : new Date(`${d}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
            </span>
            <Link href={`/events?d=${d}`} style={{ color: "var(--text-primary)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{e.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
