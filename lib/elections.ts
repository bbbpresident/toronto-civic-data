import electionsJson from "./elections.json";
import type { ElectionsData } from "@/lib/types";

// elections.json is generated — never edit it by hand. Re-run
// scripts/extract_elections.py to refresh it from the City's open data.
export const ELECTIONS_DATA = electionsJson as ElectionsData;

export const ELECTIONS = [...ELECTIONS_DATA.elections].sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));

export { fileLabel } from "@/lib/file-label";
