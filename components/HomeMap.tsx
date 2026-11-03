"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DataSourceCitation } from "@/components/SourceCitation";
import type { DataSource } from "@/lib/types";

// The map of Toronto with switchable views (transit, parks, facilities, services, homes, density…).
// Up to two views show at once: choosing a third drops the first one chosen; choosing a shown view
// hides it. Each view is a static file in public/layers/<id>.json (scripts/extract_layers.py),
// fetched only when chosen. Drawn as our own SVG on the ward outline (no map tiles; CSP stays
// self-only), optionally rotated to line up with the street grid.

export interface ViewInfo { id: string; title: string; blurb: string; group: string; count: number; sources: DataSource[]; note?: string }
interface Group { label: string; color: string | null }
interface Measure { label: string; color: string; bins?: number[]; unit?: string }
/** `info[i]` holds the facts for item i (length and rank, area, spaces…), shown when it's tapped. */
type Layer = { info?: string[] } & (
  | { type: "points"; groups: Group[]; items: [number, number, number, string, number?][]; amenities?: string[] }
  | { type: "lines"; groups: Group[]; items: [number, string, string][]; stops?: [number, number, string][]; stopInfo?: string[]; uniform?: boolean }
  | { type: "areas"; groups: Group[]; items: [number, string, string, number?, number?][]; labels?: boolean }
  | { type: "choropleth"; measures: Measure[]; items: (string | number)[][] });

/** The views the map opens on. */
const DEFAULT_VIEWS = ["bus"];
const MAX_VIEWS = 2;
/** Toronto's street grid runs about 17° off true north; turning the map clockwise by that squares it up (Yonge up, Bloor across). */
const GRID_ANGLE = 17;
const PCT_BINS = [0, 20, 40, 60, 80];
/** Shaded areas go under lines, lines under points. */
const DRAW_ORDER: Layer["type"][] = ["choropleth", "areas", "lines", "points"];

/** The drawing frame: the map itself, or, once rotated, the box around the turned city outline (so no empty corners). */
function frameFor(rotated: boolean, W: number, H: number, paths: string[]) {
  if (!rotated) return { x: 0, y: 0, w: W, h: H };
  const a = (GRID_ANGLE * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cx = W / 2, cy = H / 2;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of paths) for (const m of d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) {
    const x = +m[1] - cx, y = +m[2] - cy, rx = cx + x * c - y * s, ry = cy + x * s + y * c;
    x0 = Math.min(x0, rx); x1 = Math.max(x1, rx); y0 = Math.min(y0, ry); y1 = Math.max(y1, ry);
  }
  const pad = 4;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

export default function HomeMap({ map, views }: { map: { width: number; height: number; paths: string[] }; views: ViewInfo[] }) {
  const [active, setActive] = useState<string[]>(() => DEFAULT_VIEWS.filter(id => views.some(v => v.id === id)));
  const [layers, setLayers] = useState<Record<string, Layer>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [picked, setPicked] = useState<{ name: string; facts: string } | null>(null);
  const [amenity, setAmenity] = useState<number | null>(null);
  const [measure, setMeasure] = useState(0);
  const [rotated, setRotated] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  // The drawing frame: the map, or the box around it once rotated.
  const frame = useMemo(() => frameFor(rotated, map.width, map.height, map.paths), [rotated, map.width, map.height, map.paths]);
  const [vb, setVb] = useState({ x: 0, y: 0, w: map.width });
  const aspect = frame.h / frame.w, zoom = frame.w / vb.w;

  useEffect(() => {
    for (const id of active) {
      if (layers[id] || failed.includes(id)) continue;
      fetch(`/layers/${id}.json`).then(r => (r.ok ? r.json() : Promise.reject(r.status)))
        .then(d => setLayers(l => ({ ...l, [id]: d })))
        .catch(() => setFailed(f => [...f, id]));
    }
  }, [active, layers, failed]);

  function toggle(id: string) {
    setPicked(null);
    setActive(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id].slice(-MAX_VIEWS)));
    if (id === "facilities") setAmenity(null);
  }
  function rotate() {
    const next = frameFor(!rotated, map.width, map.height, map.paths);
    setRotated(!rotated);
    setVb({ x: next.x, y: next.y, w: next.w });
  }
  function zoomBy(f: number) {
    setVb(v => {
      const w = Math.max(frame.w / 8, Math.min(frame.w, v.w / f)), h = w * aspect;
      const cx = v.x + v.w / 2, cy = v.y + (v.w * aspect) / 2;
      return { w, x: Math.max(frame.x, Math.min(frame.x + frame.w - w, cx - w / 2)), y: Math.max(frame.y, Math.min(frame.y + frame.h - h, cy - h / 2)) };
    });
  }
  const onDown = (e: React.PointerEvent) => { if (zoom > 1.01) { drag.current = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y }; (e.target as Element).setPointerCapture?.(e.pointerId); } };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current, el = svgRef.current;
    if (!d || !el) return;
    const k = vb.w / el.getBoundingClientRect().width, h = vb.w * aspect;
    setVb(v => ({ ...v, x: Math.max(frame.x, Math.min(frame.x + frame.w - v.w, d.vx - (e.clientX - d.x) * k)), y: Math.max(frame.y, Math.min(frame.y + frame.h - h, d.vy - (e.clientY - d.y) * k)) }));
  };
  const onUp = () => { drag.current = null; };

  const s = 1 / Math.sqrt(zoom); // marks shrink a little as you zoom in, so dense views stay readable
  const counts: Record<string, number> = {};

  function draw(id: string, layer: Layer): React.ReactNode {
    const title = views.find(v => v.id === id)?.title ?? id;
    const pick = (name: string, facts = "") => () => setPicked({ name: active.length > 1 ? `${name} · ${title}` : name, facts });
    if (layer.type === "points") {
      const keep = layer.items.map((it, i) => i).filter(i => !(id === "facilities" && amenity != null) || ((layer.items[i][4] ?? 0) >> amenity!) & 1);
      counts[id] = keep.length;
      const r = (layer.items.length > 900 ? 2.4 : 3.6) * s;
      return keep.map(i => {
        const it = layer.items[i], kind = layer.groups.length > 1 ? layer.groups[it[2]].label : "";
        return (
          <circle key={i} cx={it[0]} cy={it[1]} r={r} fill={layer.groups[it[2]]?.color ?? "var(--s1)"} stroke="var(--surface)" strokeWidth={0.8 * s} style={{ cursor: "pointer" }}
            onClick={pick(it[3], [kind, layer.info?.[i]].filter(Boolean).join(" · "))}>
            <title>{it[3]}</title>
          </circle>
        );
      });
    }
    if (layer.type === "lines") {
      counts[id] = layer.items.length;
      return (
        <>
          {layer.items.map((it, i) => (
            <path key={i} d={it[2]} fill="none" stroke={layer.groups[it[0]]?.color ?? "var(--s1)"} strokeWidth={(layer.uniform ? 1.4 : id === "subway" ? 4.5 : 2.2) * s}
              strokeOpacity={layer.uniform ? 0.55 : 0.95} strokeLinecap="round" strokeLinejoin="round" onClick={pick(it[1], layer.info?.[i])} style={{ cursor: "pointer" }}>
              <title>{it[1]}</title>
            </path>
          ))}
          {layer.stops?.map((st, i) => (
            <circle key={`s${i}`} cx={st[0]} cy={st[1]} r={3.6 * s} fill="var(--text-primary)" stroke="var(--surface)" strokeWidth={1.2 * s} onClick={pick(st[2], layer.stopInfo?.[i])} style={{ cursor: "pointer" }}>
              <title>{st[2]}</title>
            </circle>
          ))}
        </>
      );
    }
    if (layer.type === "areas") {
      counts[id] = layer.items.length;
      return (
        <>
          {layer.items.map((it, i) => (
            <path key={i} d={it[2]} fill={layer.groups[it[0]].color ?? "var(--s3)"} fillOpacity={layer.labels ? 0.3 : active.length > 1 ? 0.45 : 0.6}
              stroke={layer.labels ? layer.groups[it[0]].color ?? undefined : "none"} strokeWidth={2 * s} onClick={pick(it[1], layer.info?.[i])} style={{ cursor: "pointer" }}>
              <title>{it[1]}</title>
            </path>
          ))}
          {layer.labels && layer.items.map((it, i) => it[3] != null && (
            <text key={`l${i}`} x={it[3]} y={it[4]} textAnchor="middle" dominantBaseline="middle" fontSize={20 * s} fontWeight={800} fill="var(--text-primary)"
              stroke="var(--surface)" strokeWidth={4 * s} paintOrder="stroke" pointerEvents="none"
              transform={rotated ? `rotate(${-GRID_ANGLE} ${it[3]} ${it[4]})` : undefined}>{it[1]}</text>
          ))}
        </>
      );
    }
    counts[id] = layer.items.length;
    const mi = Math.min(measure, layer.measures.length - 1), m = layer.measures[mi], bins = m.bins ?? PCT_BINS;
    return layer.items.map((it, i) => {
      const name = String(it[0]), v = Number(it[2 + mi]), bin = bins.filter(b => v >= b).length - 1;
      const text = m.unit ? `${v.toLocaleString("en-CA")}${m.unit}` : `${v}%`;
      return (
        <path key={i} d={String(it[1])} fill={m.color} fillOpacity={(0.12 + bin * 0.19) * (active.length > 1 ? 0.75 : 1)} stroke="var(--surface)" strokeWidth={0.8 * s}
          onClick={pick(name, layer.info?.[i] ?? `${text}${m.unit ? "" : ` ${m.label.toLowerCase()}`}`)} style={{ cursor: "pointer" }}>
          <title>{`${name}: ${text}`}</title>
        </path>
      );
    });
  }

  const shown = active.filter(id => layers[id]).sort((a, b) => DRAW_ORDER.indexOf(layers[a].type) - DRAW_ORDER.indexOf(layers[b].type));
  const bodies = shown.map(id => <g key={id}>{draw(id, layers[id])}</g>);
  const loading = active.filter(id => !layers[id] && !failed.includes(id));

  const chip = (on: boolean): React.CSSProperties => ({
    fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
    border: `1px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "var(--surface-2)" : "transparent", color: on ? "var(--text-primary)" : "var(--text-secondary)",
  });
  const btn: React.CSSProperties = { minWidth: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", fontSize: 16, cursor: "pointer", padding: "0 6px" };
  const legendDot = (color: string | null, round: boolean) => (
    <span aria-hidden style={{ display: "inline-block", width: 10, height: 10, borderRadius: round ? 5 : 2, background: color ?? "var(--s1)", marginRight: 5, verticalAlign: "-1px" }} />
  );

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }} role="group" aria-label="Map views (up to two at once)">
        {views.map(v => <button key={v.id} type="button" aria-pressed={active.includes(v.id)} onClick={() => toggle(v.id)} style={chip(active.includes(v.id))}>{v.title}</button>)}
      </div>

      {active.map(id => {
        const v = views.find(x => x.id === id)!, layer = layers[id];
        return (
          <div key={id} style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 6px" }}><strong style={{ color: "var(--text-primary)" }}>{v.title}.</strong> {v.blurb}</p>
            {layer?.type === "points" && layer.amenities && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }} role="group" aria-label="Filter facilities by amenity">
                <button type="button" aria-pressed={amenity == null} onClick={() => setAmenity(null)} style={chip(amenity == null)}>All</button>
                {layer.amenities.map((a, i) => <button key={a} type="button" aria-pressed={amenity === i} onClick={() => setAmenity(i)} style={chip(amenity === i)}>{a}</button>)}
              </div>
            )}
            {layer?.type === "choropleth" && layer.measures.length > 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }} role="group" aria-label={`Which ${v.title.toLowerCase()}`}>
                {layer.measures.map((m, i) => <button key={m.label} type="button" aria-pressed={measure === i} onClick={() => setMeasure(i)} style={chip(measure === i)}>{m.label}</button>)}
              </div>
            )}
          </div>
        );
      })}

      {active.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "6px 16px", padding: "8px 12px",
          marginBottom: 8, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", minHeight: 40 }}>
          <div aria-live="polite" style={{ flex: "1 1 220px", minWidth: 0, fontSize: 13, lineHeight: 1.45 }}>
            {picked ? (
              <>
                <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{picked.name}</div>
                {picked.facts && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{picked.facts}</div>}
              </>
            ) : (
              <span style={{ color: "var(--text-secondary)" }}>{zoom > 1.01 ? "Drag to move around. Tap anything on the map for details." : "Tap anything on the map for details; zoom in with +."}</span>
            )}
          </div>
          <div aria-label="Legend" style={{ flex: "1 1 220px", display: "grid", gap: 2, justifyItems: "end", textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{shown.map(id => {
              const l = layers[id], n = counts[id] ?? 0;
              const noun = l.type === "lines" ? (id === "cycling" ? "segments" : "routes") : l.type === "choropleth" ? "neighbourhoods" : l.type === "areas" ? "parks" : "places";
              return `${views.find(v => v.id === id)?.title}: ${n.toLocaleString("en-CA")} ${noun}`;
            }).join(" · ")}</div>
            {shown.map(id => {
        const l = layers[id];
        if (l.type === "choropleth") {
          const m = l.measures[Math.min(measure, l.measures.length - 1)], bins = m.bins ?? PCT_BINS;
          return (
            <div key={id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 2, fontSize: 11, color: "var(--text-secondary)" }} aria-label="Legend">
              {bins.map((b, i) => (
                <span key={b} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <span aria-hidden style={{ display: "inline-block", width: 18, height: 10, background: m.color, opacity: 0.12 + i * 0.19, borderRadius: 2 }} />
                  {b.toLocaleString("en-CA")}{i === bins.length - 1 ? "+" : ""}{!m.unit && i === bins.length - 1 ? "%" : ""}
                </span>
              ))}
              <span style={{ marginLeft: 6 }}>{m.unit ? "people per km²" : "% of homes"}</span>
            </div>
          );
        }
        if ((l.type === "lines" && l.uniform) || (l.type === "areas" && l.labels) || l.groups.length < 2 || l.groups.length > 8) return null;
        return (
          <div key={id} style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "4px 14px", marginTop: 2, fontSize: 12, color: "var(--text-secondary)" }}>
            {l.groups.map(g => <span key={g.label}>{legendDot(g.color, l.type === "points")}{g.label}</span>)}
          </div>
        );
      })}

          </div>
        </div>
      )}

      <div style={{ position: "relative" }}>
        <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.w * aspect}`} width="100%" role="img"
          aria-label={`Map of Toronto${rotated ? ", turned to line up with the street grid" : ""}: ${active.map(id => views.find(v => v.id === id)?.title).join(" and ") || "no views chosen"}`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          style={{ display: "block", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", touchAction: zoom > 1.01 ? "none" : "auto", cursor: zoom > 1.01 ? "grab" : "default" }}>
          <g transform={rotated ? `rotate(${GRID_ANGLE} ${map.width / 2} ${map.height / 2})` : undefined}>
            <g fill="none" stroke="var(--text-secondary)" strokeWidth={4 * s} strokeLinejoin="round">{map.paths.map((d, i) => <path key={i} d={d} />)}</g>
            <g fill="var(--surface-2)" stroke="var(--surface-2)" strokeWidth={1.5 * s}>{map.paths.map((d, i) => <path key={i} d={d} />)}</g>
            <text x={map.width * 0.6} y={map.height - 14} textAnchor="middle" fontSize={22} fill="var(--text-secondary)" opacity={0.5} fontStyle="italic"
              transform={rotated ? `rotate(${-GRID_ANGLE} ${map.width * 0.6} ${map.height - 14})` : undefined}>Lake Ontario</text>
            {/* Everything is trimmed to the city's outline (bus routes run on into York Region, for one). */}
            <defs><clipPath id="home-map-city">{map.paths.map((d, i) => <path key={i} d={d} />)}</clipPath></defs>
            <g clipPath="url(#home-map-city)">{bodies}</g>
          </g>
        </svg>
        <div style={{ position: "absolute", top: 8, right: 8, display: "grid", gap: 4, justifyItems: "end" }}>
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.6)} style={btn}>+</button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.6)} style={btn}>−</button>
          {zoom > 1.01 && <button type="button" aria-label="Show all of Toronto" onClick={() => setVb({ x: frame.x, y: frame.y, w: frame.w })} style={{ ...btn, fontSize: 11 }}>All</button>}
          <button type="button" aria-pressed={rotated} onClick={rotate} title={rotated ? "Back to north up" : "Turn the map to line up with the street grid"}
            style={{ ...btn, fontSize: 11, borderColor: rotated ? "var(--blue)" : "var(--border)" }}>{rotated ? "North up" : "Grid ⟳"}</button>
        </div>
        {loading.length > 0 && <div style={{ position: "absolute", left: 10, bottom: 10, fontSize: 12, color: "var(--text-secondary)" }}>Loading…</div>}
        {active.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--text-secondary)", pointerEvents: "none" }}>
            Choose a view above.
          </div>
        )}
      </div>


      {active.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>Where {active.length > 1 ? "these views come" : "this view comes"} from</summary>
          {active.map(id => {
            const v = views.find(x => x.id === id)!;
            return (
              <div key={id} style={{ marginTop: 10 }}>
                {active.length > 1 && <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{v.title}</div>}
                {v.note && <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 8px", lineHeight: 1.5 }}>{v.note}</p>}
                <div style={{ display: "grid", gap: 10 }}>{v.sources.map((src, i) => <DataSourceCitation key={i} source={src} />)}</div>
              </div>
            );
          })}
        </details>
      )}
    </div>
  );
}
