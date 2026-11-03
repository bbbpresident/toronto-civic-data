import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import HomeMap from "@/components/HomeMap";
import { card } from "@/components/BudgetParts";
import { LAYERS } from "@/lib/layers";

export const metadata: Metadata = { title: "Toronto on a map · Toronto Civic Data" };

export default function MapPage() {
  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: 48 }}>
      <PageNav />
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 6px" }}>Toronto on a map</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>
          Transit, bike lanes, green space, courts and fields, libraries, schools, child care, housing and density, each from the City&apos;s (or the TTC&apos;s) own data.
          Pick up to two views, tap anything for details, and zoom in with +.
        </p>
      </header>
      <section style={{ ...card, padding: "16px 16px 14px" }}>
        <HomeMap map={LAYERS.map} views={LAYERS.views} />
      </section>
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "14px 0 0" }}>Map data generated {LAYERS.generatedOn}; each view lists its sources.</p>
    </div>
  );
}
