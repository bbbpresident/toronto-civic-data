"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Place, PlaceKind } from "@/lib/types";

// TOday's Sunday map question: find a place on a blank map of Toronto. On touch screens a magnifier
// follows your finger (the pin drops where you lift it); with a mouse, click to place the pin; with a
// keyboard, the arrow keys move it. The map is the 25-ward outline with the ward lines hidden.

export type Pt = [number, number];
export interface BlankMapData { width: number; height: number; paths: string[]; kmPerUnit: number }

export const KIND_LABEL: Record<PlaceKind, string> = {
  landmark: "Landmark", park: "Park", neighbourhood: "Neighbourhood", district: "District", beach: "Beach", station: "TTC subway station",
};

const LOUPE = 150, ZOOM = 3;
const RED = "#ef4444", GREEN = "#22c55e";

/** The city's outline only: every ward drawn twice — a thick outline layer, then the fill on top hides the inner borders. */
export function MapLayers({ map }: { map: BlankMapData }) {
  return (
    <>
      <rect width={map.width} height={map.height} fill="var(--surface)" />
      <text x={map.width * 0.6} y={map.height - 14} textAnchor="middle" fontSize={22} fill="var(--text-secondary)" opacity={0.6} fontStyle="italic">Lake Ontario</text>
      <g fill="none" stroke="var(--text-secondary)" strokeWidth={5} strokeLinejoin="round">{map.paths.map((d, i) => <path key={i} d={d} />)}</g>
      <g fill="var(--surface-2)" stroke="var(--surface-2)" strokeWidth={1.5} strokeLinejoin="round">{map.paths.map((d, i) => <path key={i} d={d} />)}</g>
    </>
  );
}

export function Pin({ at, color, r = 9 }: { at: Pt; color: string; r?: number }) {
  return (
    <g>
      <circle cx={at[0]} cy={at[1]} r={r} fill={color} stroke="var(--surface)" strokeWidth={r / 3} />
      <circle cx={at[0]} cy={at[1]} r={r * 0.28} fill="var(--surface)" />
    </g>
  );
}

/** The pin input. The game's clock lives in the game; `onDraft` tells it where the pin is, so it can lock that in if time runs out. */
export default function MapGuess({ place, map, onSubmit, onDraft }: { place: Place; map: BlankMapData; onSubmit: (v: Pt | null) => void; onDraft?: (v: Pt | null) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState<Pt | null>(null);
  /** Finger position in the box, the map point under it, how many map units the magnifier spans, and the box width. */
  const [loupe, setLoupe] = useState<{ x: number; y: number; pt: Pt; span: number; boxW: number } | null>(null);
  const done = useRef(false);
  useEffect(() => { onDraft?.(pin); }, [pin, onDraft]);
  const submit = useCallback((v: Pt | null) => { if (!done.current) { done.current = true; onSubmit(v); } }, [onSubmit]);

  const toMap = (clientX: number, clientY: number): Pt | null => {
    const svg = svgRef.current, m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return [Math.max(0, Math.min(map.width, p.x)), Math.max(0, Math.min(map.height, p.y))];
  };
  // The magnifier shows LOUPE px of the map at ZOOM× the on-screen size, centred on the finger.
  const loupeAt = (e: React.PointerEvent) => {
    const box = boxRef.current!.getBoundingClientRect(), pt = toMap(e.clientX, e.clientY);
    const shownW = svgRef.current?.getBoundingClientRect().width || map.width;
    if (pt) setLoupe({ x: e.clientX - box.left, y: e.clientY - box.top, pt, span: (LOUPE / ZOOM) * (map.width / shownW), boxW: box.width });
  };

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse") { const pt = toMap(e.clientX, e.clientY); if (pt) setPin(pt); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    loupeAt(e);
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => { if (loupe) loupeAt(e); };
  const onUp = () => { if (loupe) { setPin(loupe.pt); setLoupe(null); } };
  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const step = e.shiftKey ? 25 : 6, d: Record<string, Pt> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (d[e.key]) {
      e.preventDefault();
      const p = pin ?? [map.width / 2, map.height / 2];
      setPin([Math.max(0, Math.min(map.width, p[0] + d[e.key][0])), Math.max(0, Math.min(map.height, p[1] + d[e.key][1]))]);
    } else if (e.key === "Enter" && pin) { e.preventDefault(); submit(pin); }
  };

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
      <div ref={boxRef} style={{ position: "relative" }}>
        <svg ref={svgRef} viewBox={`0 0 ${map.width} ${map.height}`} width="100%" tabIndex={0} role="application"
          aria-label={`Blank map of Toronto. Tap, click or use the arrow keys to place your pin${pin ? "; a pin is placed" : ""}, then lock it in.`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setLoupe(null)} onKeyDown={onKey}
          style={{ display: "block", touchAction: "none", cursor: "crosshair", borderRadius: 12, border: "1px solid var(--border)", outlineOffset: 2 }}>
          <MapLayers map={map} />
          {pin && <Pin at={pin} color={RED} />}
        </svg>
        {loupe && (
          <div aria-hidden style={{
            position: "absolute", width: LOUPE, height: LOUPE, borderRadius: "50%", overflow: "hidden", pointerEvents: "none",
            left: Math.max(0, Math.min(loupe.boxW - LOUPE, loupe.x - LOUPE / 2)), top: loupe.y - LOUPE - 36,
            border: "3px solid var(--blue)", boxShadow: "0 8px 24px rgba(0,0,0,.5)", background: "var(--surface)",
          }}>
            <svg width={LOUPE} height={LOUPE} viewBox={`${loupe.pt[0] - loupe.span / 2} ${loupe.pt[1] - loupe.span / 2} ${loupe.span} ${loupe.span}`}>
              <MapLayers map={map} />
              {pin && <Pin at={pin} color={RED} r={9 / ZOOM * 1.5} />}
              <line x1={loupe.pt[0] - loupe.span / 2} x2={loupe.pt[0] + loupe.span / 2} y1={loupe.pt[1]} y2={loupe.pt[1]} stroke={RED} strokeWidth={loupe.span / 150} />
              <line y1={loupe.pt[1] - loupe.span / 2} y2={loupe.pt[1] + loupe.span / 2} x1={loupe.pt[0]} x2={loupe.pt[0]} stroke={RED} strokeWidth={loupe.span / 150} />
            </svg>
          </div>
        )}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
        {pin ? "Pin placed. Tap again to move it, or lock it in." : "Tap or click the map to drop your pin. On a phone, drag to aim with the magnifier."}
      </p>
      <button type="button" disabled={!pin} onClick={() => submit(pin)}
        style={{ fontSize: 15, fontWeight: 700, padding: "11px 18px", borderRadius: 10, border: "none", background: "var(--blue)", color: "#0b0e15",
          opacity: pin ? 1 : 0.45, cursor: pin ? "pointer" : "not-allowed", justifySelf: "start" }}>
        Lock it in
      </button>
      <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{KIND_LABEL[place.kind]}: {place.name}</span>
    </div>
  );
}

/** After the game: the answer (green point or outline) and the guess (red), joined by a dashed line. */
export function MapReveal({ place, map, guess }: { place: Place; map: BlankMapData; guess: Pt | null }) {
  const target: Pt = place.point ?? (() => {
    const r = (place.rings ?? [[]]).reduce((a, b) => (b.length > a.length ? b : a));
    return [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length] as Pt;
  })();
  return (
    <svg viewBox={`0 0 ${map.width} ${map.height}`} width="100%" role="img"
      aria-label={`Map: ${place.name} in green${guess ? ", your pin in red" : ""}`} style={{ display: "block", borderRadius: 12, border: "1px solid var(--border)", marginTop: 10 }}>
      <MapLayers map={map} />
      {place.rings && <g fill={GREEN} fillOpacity={0.45} stroke={GREEN} strokeWidth={2}>{place.rings.map((r, i) => <path key={i} d={`M${r.map(p => p.join(",")).join("L")}Z`} />)}</g>}
      {guess && <line x1={guess[0]} y1={guess[1]} x2={target[0]} y2={target[1]} stroke="var(--text-primary)" strokeWidth={2} strokeDasharray="6 5" opacity={0.7} />}
      {place.point && <Pin at={place.point} color={GREEN} />}
      {guess && <Pin at={guess} color={RED} />}
    </svg>
  );
}
