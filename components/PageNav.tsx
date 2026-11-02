import Link from "next/link";

// Top-of-page navigation for every data page: always a Home button, plus an optional
// "up one level" link (e.g. a budget year's breakdown back to all years).

const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, textDecoration: "none",
  padding: "7px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)",
};

export default function PageNav({ up }: { up?: { href: string; label: string } }) {
  return (
    <nav aria-label="Page" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
      <Link href="/" className="page-nav-btn" style={{ ...btn, color: "var(--text-primary)" }}>
        <span aria-hidden>⌂</span> Home
      </Link>
      {up && (
        <Link href={up.href} className="page-nav-btn" style={{ ...btn, color: "var(--text-secondary)" }}>
          <span aria-hidden>←</span> {up.label}
        </Link>
      )}
    </nav>
  );
}
