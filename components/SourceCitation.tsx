import type { DataSource, PageSource } from "@/lib/types";
import { fileLabel } from "@/lib/file-label";

const linkStyle: React.CSSProperties = { color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: 2, wordBreak: "break-word" };

/** Full citation for an open-data figure: dataset, exact file, where in it, and how it was derived. */
export function DataSourceCitation({ source, label = "Source" }: { source: DataSource; label?: string }) {
  return (
    <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--text-secondary)", borderLeft: "2px solid var(--border)", paddingLeft: 10, minWidth: 0, overflowWrap: "anywhere" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div>
        {source.publisher} ·{" "}
        <a href={source.datasetUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>{source.dataset}</a>
      </div>
      <div>
        File:{" "}
        <a href={source.fileUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>{fileLabel(source.fileUrl, source.member)}</a>
      </div>
      <div>Location: {source.locator}</div>
      <div>Method: {source.method}</div>
    </div>
  );
}

/** Compact inline citation for a web page — a small linked marker with the publisher in its title. */
export function PageSourceLink({ source }: { source: PageSource }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${source.publisher}: ${source.title} (checked ${source.accessed})`}
      aria-label={`Source: ${source.publisher}, ${source.title}`}
      style={{ ...linkStyle, fontSize: 11, whiteSpace: "nowrap" }}
    >
      source ↗
    </a>
  );
}
