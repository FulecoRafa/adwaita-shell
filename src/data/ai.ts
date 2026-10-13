// The AI usage panel's data (plugin "ai", topic "details").

export interface Limit {
  /** "session" | "week" | "opus" | "sonnet" */
  key: string;
  /** 0..100, -1 unknown. */
  percent: number;
  /** Epoch seconds, null when not reported. */
  resetsAt: number | null;
}
export interface Provider {
  available: boolean;
  model: string;
  plan: string;
  stale: boolean;
  limits: Limit[];
}
export interface Details {
  claude: Provider;
  codex: Provider;
  /** Epoch seconds of the newest reading; 0 = never. */
  updatedAt: number;
  /** Daily peak of the session window, last 7 days, oldest first. */
  history: { claude: number[]; codex: number[] };
}

export const details = () => use("ai").subscribe<Details>("details")();
export const refresh = () => use("ai").call("refresh");
