import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import EventsCalendar from "@/components/EventsCalendar";
import { Shell, Header } from "@/components/SectionParts";
import { DataSourceCitation } from "@/components/SourceCitation";
import { card, link } from "@/components/BudgetParts";
import { CITY } from "@/lib/city";

export const metadata: Metadata = { title: "What's on in Toronto · Toronto Civic Data" };

const slim = CITY.events.items.map(({ name, url, category, free, where, start, end }) => ({ name, url, category, free, where, start, end }));

export default function EventsPage() {
  const ev = CITY.events;
  return (
    <Shell>
      <PageNav />
      <Header title="What's on in Toronto">
        Festivals, markets, exhibitions and community events from the City&apos;s Festivals &amp; Events calendar. Pick a day to see what&apos;s happening.{" "}
        <a href={ev.submitUrl} target="_blank" rel="noopener noreferrer" style={link}>Hosting something? Add it to the calendar ↗</a>
      </Header>
      <section style={card}>
        <EventsCalendar from={ev.from} to={ev.to} items={slim} days={ev.days} calendarUrl={ev.calendarUrl} />
      </section>
      {ev.ongoing.length > 0 && (
        <section style={{ ...card, marginTop: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 4px" }}>Ongoing</h2>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 6px" }}>Exhibitions and programs running for more than a few days, ending soonest first.</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, columns: "260px 2", columnGap: 24 }}>
            {ev.ongoing.map(i => ev.items[i]).map((e, i) => (
              <li key={i} style={{ breakInside: "avoid", padding: "8px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}>
                <a href={e.url ?? ev.calendarUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-primary)", fontWeight: 700, textDecoration: "none" }}>{e.name} ↗</a>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  {e.end ? `Until ${new Date(`${e.end}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}` : ""}{e.where ? ` · ${e.where}` : ""}{e.free ? " · Free" : ""}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "16px 0 8px", lineHeight: 1.55 }}>
        A snapshot of the City&apos;s calendar taken {CITY.generatedOn}, covering {ev.from} to {ev.to}. Check an event&apos;s own page before you go;{" "}
        <a href={ev.calendarUrl} target="_blank" rel="noopener noreferrer" style={link}>the City&apos;s calendar ↗</a> is always current.
      </p>
      <DataSourceCitation source={ev.source} />
    </Shell>
  );
}
