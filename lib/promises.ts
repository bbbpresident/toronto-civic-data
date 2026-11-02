import json from "./promises.json";
import type { PromiseStatus, PromisesData } from "@/lib/types";

// Hand-curated research — the only hand-written JSON in lib/. Every quote and vote is verified by
// scripts/check_promises.py; every status cites an official City (or City agency) record.
export const PROMISES = json as unknown as PromisesData;
export const CAMPAIGNS = [...PROMISES.campaigns].sort((a, b) => b.electionYear - a.electionYear);
export const getCampaign = (id: string) => CAMPAIGNS.find(c => c.id === id);

export const VOTING_RECORD_URL = "https://open.toronto.ca/dataset/members-of-toronto-city-council-voting-record/";

/** Order, label, icon and colour for each status. Colour never carries the meaning alone. */
export const STATUS: Record<PromiseStatus, { label: string; icon: string; color: string; order: number; definition: string }> = {
  "done": { label: "Done", icon: "✓", color: "#0ca30c", order: 0, definition: "An official record shows the promised action was taken." },
  "partly": { label: "Partly done", icon: "◐", color: "#fab219", order: 1, definition: "Records show action, but short of what was promised (smaller, slower, or only part of it)." },
  "in-progress": { label: "In progress", icon: "↻", color: "var(--blue)", order: 2, definition: "Council or the City has started and records show it under way; it isn't finished or its timeline isn't over." },
  "no-action-found": { label: "No City action found", icon: "○", color: "var(--text-secondary)", order: 3, definition: "We searched City records and found none. That isn't proof nothing happened — only that we couldn't find a record." },
  "reversed": { label: "Reversed", icon: "↩", color: "#d03b3b", order: 4, definition: "Council later voted to undo or go against the promise." },
};
export const STATUS_ORDER = (Object.keys(STATUS) as PromiseStatus[]).sort((a, b) => STATUS[a].order - STATUS[b].order);
