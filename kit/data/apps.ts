// Installed apps, for bars, launchers and docks: the list, search ranked by
// use, pins, launching and the icon of a window's app.
// Needs the capabilities "apps", "apps:launch" and "state".

export interface App {
  id: string;
  name: string;
  /** Image source, "" when the theme has no icon. */
  icon: string;
}

// The list comes from the host once per load; bindings re-run often.
let installed: App[] | null = null;
export const all = (): App[] => (installed ??= apps.list());

/** How often and how recently each app was launched from here. */
export const usage = shared<Record<string, { count: number; last: number }>>("usage", {}, { store: true });

/** Pinned by the user: desktop entry ids, or "tui:name" for terminal apps. */
export const pins = shared<string[]>("pinned", [], { store: true });

export function togglePin(id: string) {
  pins.update((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
}

/** Launch an app (an entry id) or a command, and count it for ranking. */
export function launch(target: string | string[]) {
  apps.launch(target);
  if (typeof target === "string") {
    usage.update((u) => ({ ...u, [target]: { count: (u[target]?.count ?? 0) + 1, last: Date.now() } }));
  }
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Apps matching `query`, best first: name prefix, word prefix, anywhere in
 * the name or id; ties go to the most used. An empty query lists the most
 * used apps.
 */
export function search(query: string, limit = 8): App[] {
  const q = fold(query.trim());
  const used = usage.peek();
  const score = (a: App) => {
    const name = fold(a.name);
    const match = !q ? 1 : name.startsWith(q) ? 4 : name.split(/\s+/).some((w) => w.startsWith(q)) ? 3 : name.includes(q) ? 2 : fold(a.id).includes(q) ? 1 : 0;
    const u = used[a.id];
    return match === 0 ? -1 : match * 1000 + Math.min(999, (u?.count ?? 0) * 10);
  };
  return all()
    .map((a) => ({ a, s: score(a) }))
    .filter((x) => x.s >= 0)
    .sort((x, y) => y.s - x.s || x.a.name.localeCompare(y.a.name))
    .slice(0, limit)
    .map((x) => x.a);
}

// One lookup per window class.
const classIcons = new Map<string, string>();

/** Theme icon for a window class (app id); "" when there is none. */
export function iconFor(cls: string): string {
  let icon = classIcons.get(cls);
  if (icon === undefined) {
    icon = apps.lookup(cls)?.icon || apps.icon(cls.toLowerCase());
    classIcons.set(cls, icon);
  }
  return icon;
}
