/** The download a source points at, including the file inside a zip when there is one. */
export function fileLabel(fileUrl: string, member: string | null): string {
  // Open Data "datastore dump" URLs end in a resource id, not a file name.
  if (fileUrl.includes("/datastore/dump/")) return "Full table, CSV export";
  const file = decodeURIComponent(fileUrl.split("/").pop() ?? fileUrl);
  return member ? `${file} → ${member}` : file;
}
