// What this project needs from tessela, as editor types. Everything here is a
// frozen global provided by the framework's preludes; nothing is imported.
// Project files import each other with relative ES imports.

// ---------------------------------------------------------------- reactivity

/** A reactive value. Call it to read (tracked inside function props). */
interface Signal<T> {
  (): T;
  peek(): T;
}
interface WritableSignal<T> extends Signal<T> {
  set(value: T): void;
  update(fn: (prev: T) => T): void;
}

declare function signal<T>(initial: T): WritableSignal<T>;
/** Like `signal`, but the value survives hot reloads of this surface. */
declare function persist<T>(key: string, initial: T): WritableSignal<T>;
/** A derived value: `fn` re-runs when what it reads changes; code reading the memo re-runs only when the result differs. */
declare function memo<T>(fn: () => T): Signal<T>;
declare function log(...parts: unknown[]): void;

/** A declarative event handler: the host calls a module, no guest code runs. */
interface Action {
  readonly $action: { module: string; func: string; args: unknown };
}

// ---------------------------------------------------------------- context
// Quick-access facts about the machine and session (capability "context").

interface Screen {
  name: string;
  width: number;
  height: number;
  scale: number;
}

declare const ctx: {
  readonly user: string;
  readonly hostname: string;
  readonly home: string;
  /** BCP 47, e.g. "pt-BR". */
  readonly locale: string;
  readonly desktop: string;
  /** The surface this code renders into. */
  readonly surface: string;
  /** org.freedesktop.appearance color-scheme. */
  colorScheme(): "dark" | "light";
  screen(): Screen;
  /** Wall clock, ticking at the given precision. */
  now(precision?: "minute" | "second"): Date;
};

// ---------------------------------------------------------------- shared state
// One value shared by every surface of the app (capability "state").
// With { store: true } it is also saved to disk and survives restarts.

declare function shared<T>(key: string, initial: T, opts?: { store?: boolean }): WritableSignal<T>;

// ---------------------------------------------------------------- data modules

interface Workspace {
  id: number;
  name: string;
  monitor: string;
  windows: number;
  /** Shown on its monitor. */
  active: boolean;
  /** Active on the focused monitor. */
  focused: boolean;
}
interface Client {
  address: string;
  /** app-id / WM class. */
  class: string;
  title: string;
  workspace: number;
  focused: boolean;
}
/** Hyprland IPC (capability "hyprland"; dispatching needs "hyprland:dispatch"). */
declare const hyprland: {
  workspaces(): Workspace[];
  clients(): Client[];
  /** Active keyboard layout name of the main keyboard. */
  keyboardLayout(): string;
  dispatch(command: string): void;
  dispatchAction(command: string): Action;
  /** Switch every keyboard to its layout number `index`. */
  switchLayout(index: number): void;
};

interface Battery {
  percent: number;
  charging: boolean;
  /** "Charging" | "Discharging" | "Full" | "Not charging"... */
  status: string;
  /** Seconds to empty (or full, when charging); 0 = unknown. */
  timeLeft: number;
  watts: number;
}
/** /proc and /sys readings (capability "system"). */
declare const system: {
  /** CPU usage in percent, every 2 s. */
  // Each is null until the first reading.
  cpu(): number | null;
  cpuHistory(): number[] | null;
  memory(): { percent: number; usedGiB: number; totalGiB: number } | null;
  disk(): { percent: number; usedGiB: number; totalGiB: number } | null;
  temperature(): number | null;
  battery(): Battery | null;
};

interface AppInfo {
  id: string;
  name: string;
  /** Image source for <Image>, "" when the theme has no icon. */
  icon: string;
}
/** Desktop entries and the icon theme (capability "apps"; launching needs "apps:launch"). */
declare const apps: {
  /** Best desktop entry for a window class. */
  lookup(appId: string): AppInfo | null;
  /** Image source for a theme icon name, "" if the theme has none. */
  icon(name: string): string;
  /** Every visible desktop entry. */
  list(): AppInfo[];
  launch(idOrCommand: string | string[]): void;
  launchAction(idOrCommand: string | string[]): Action;
};

interface TrayItem {
  id: string;
  title: string;
  tooltip: string;
  status: "active" | "passive" | "attention";
  /** Image source for <Image>. */
  icon: string;
  /** The item only offers a menu (left click opens it). */
  onlyMenu: boolean;
  hasMenu: boolean;
}
interface MenuEntry {
  id: number;
  label: string;
  enabled: boolean;
  separator: boolean;
  toggle: "checkmark" | "radio" | null;
  checked: boolean;
  /** Image source for <Image>, "" if none. */
  icon: string;
  children: MenuEntry[];
}
/** StatusNotifierItem tray with dbusmenu menus (capability "tray"). */
declare const tray: {
  items(): TrayItem[];
  /** The item's menu; loaded while some binding reads it. */
  menu(id: string): Signal<MenuEntry[] | null>;
  activate(id: string): void;
  secondaryActivate(id: string): void;
  scroll(id: string, delta: number): void;
  /** Click a menu entry. */
  trigger(id: string, entry: number): void;
};

// ---------------------------------------------------------------- services (plugins)

type CallResult<T = unknown> = { ok: true; value: T } | { ok: false; error: string };
interface ServiceHandle {
  /** Current value first, then every change. `null` while the service is down. */
  subscribe<T = unknown>(path: string): Signal<T | null>;
  call<T = unknown>(method: string, args?: unknown, callback?: (r: CallResult<T>) => void): void;
  action(method: string, args?: Record<string, unknown>): Action;
}
/** Plugin services over Unix sockets (capability "service:<name>"). */
declare function use(name: string): ServiceHandle;

// ---------------------------------------------------------------- timers

declare function after(ms: number, fn: () => void): () => void;
declare function every(ms: number, fn: () => void): () => void;

// ---------------------------------------------------------------- components

type Bind<T> = T | (() => T);
type Child = ViewNode | string | number | null | false | undefined | (() => Child | Child[]) | Child[];
type On<P = void> = ((payload: P) => void) | Action;

interface ViewNode {
  readonly type: string;
}
interface Keyed {
  key?: string | number;
}

/** "#rrggbb", "#rrggbbaa" or a theme token from tessela.toml: "$surface". */
type Color = string;
/** One value for every side, [vertical, horizontal] or [top, right, bottom, left]. */
type Sides = number | [number, number] | [number, number, number, number];
/** One radius, or [top-left, top-right, bottom-right, bottom-left]. */
type Radius = number | [number, number, number, number];

interface Events {
  onClick?: On;
  onRightClick?: On;
  onMiddleClick?: On;
  onScroll?: On<{ delta: 1 | -1 }>;
}

interface BoxProps extends Keyed, Events {
  direction?: Bind<"row" | "column">;
  gap?: Bind<number>;
  padding?: Bind<Sides>;
  align?: Bind<"start" | "center" | "end" | "stretch">;
  justify?: Bind<"start" | "center" | "end" | "between">;
  /** Pixels, or a percentage of the parent ("62%"). */
  width?: Bind<number | `${number}%`>;
  height?: Bind<number | `${number}%`>;
  minWidth?: Bind<number>;
  maxWidth?: Bind<number>;
  /** Cap the height (with `scroll`, a list that grows up to it, then scrolls). */
  maxHeight?: Bind<number>;
  /** Take the remaining space along the parent's direction. */
  grow?: Bind<boolean>;
  bg?: Bind<Color>;
  border?: Bind<Color>;
  radius?: Bind<Radius>;
  opacity?: Bind<number>;
  /** Drawn by the renderer on hover: no round trip to guest code. */
  hoverBg?: Bind<Color>;
  hoverOpacity?: Bind<number>;
  tooltip?: Bind<string>;
  /** Take the box out of the flow and pin it inside its parent (badges, dots). */
  place?: Bind<{ top?: number; right?: number; bottom?: number; left?: number }>;
  /** Scroll vertically when the content is taller than the box. */
  scroll?: Bind<boolean>;
  /**
   * Files (absolute paths) dragged out to other apps: pressing and moving
   * past a few pixels starts a drag offering them as text/uri-list.
   */
  drag?: Bind<string | string[]>;
  onDragStart?: On;
  onDragEnd?: On<{ dropped: boolean }>;
  children?: Child;
}
declare function Box(props: BoxProps): ViewNode;

/** One line of editable text. The renderer owns the text while typing. */
interface InputProps extends Keyed {
  value: Bind<string>;
  placeholder?: Bind<string>;
  onChange?: On<{ value: string }>;
  onSubmit?: On<{ value: string }>;
  /**
   * Keys the field does not edit with: "up", "down", "tab", "shift+tab",
   * "escape", "pageup", "ctrl+enter", "ctrl+c"... With it set, Escape no
   * longer just unfocuses. Ctrl+V pastes, Ctrl+W and Ctrl+Backspace delete a word.
   */
  onKey?: On<{ key: string; value: string }>;
  size?: Bind<number>;
  color?: Bind<Color>;
  /** Take keyboard focus when the surface opens. */
  autofocus?: boolean;
  /** Drawn as dots (passwords). */
  secret?: Bind<boolean>;
}
declare function Input(props: InputProps): ViewNode;

interface LabelProps extends Keyed {
  text: Bind<string>;
  color?: Bind<Color>;
  size?: Bind<number>;
  weight?: Bind<"normal" | "medium" | "semibold" | "bold">;
  /** Font family; the project default otherwise. */
  font?: Bind<string>;
  /** Cut with an ellipsis past this width. */
  maxWidth?: Bind<number>;
  /** Wrap to the parent's width (notification bodies). */
  wrap?: Bind<boolean>;
  /** With `wrap`: at most this many lines, then an ellipsis. */
  lines?: Bind<number>;
}
declare function Label(props: LabelProps): ViewNode;

interface ImageProps extends Keyed {
  /** "asset:<path in the project>", "icon:<theme icon name>" or a source a module returned. */
  src: Bind<string>;
  size: Bind<number>;
  opacity?: Bind<number>;
  /** Rounded corners that clip the picture. */
  radius?: Bind<number | [number, number, number, number]>;
  /** "contain" (default) shows all of it; "cover" fills the square, cropping. */
  fit?: Bind<"contain" | "cover">;
}
declare function Image(props: ImageProps): ViewNode;

/** Circular progress; children are drawn centered on it. */
interface RingProps extends Keyed {
  value: Bind<number>;
  size: Bind<number>;
  thickness?: Bind<number>;
  color?: Bind<Color>;
  track?: Bind<Color>;
  children?: Child;
}
declare function Ring(props: RingProps): ViewNode;

/**
 * A horizontal level set by clicking, dragging or scrolling (volume,
 * brightness). The renderer moves it under the pointer while dragging and
 * reports whole percents; set `value` back from `onChange`. Without
 * `onChange` or `onCommit` it is a plain meter.
 *
 * It can also move by itself, drawn by the renderer at frame rate with no
 * code of yours running (media progress): `rate` advances `value` from `at`,
 * and `wave` draws the filled part as a moving sine line, the rest as a flat
 * `track`, with a pill at the level.
 */
interface SliderProps extends Keyed {
  /** 0..1 */
  value: Bind<number>;
  /** The parent's width by default. */
  width?: Bind<number | `${number}%`>;
  thickness?: Bind<number>;
  color?: Bind<Color>;
  track?: Bind<Color>;
  /** What one wheel notch adds or takes; 0.05 by default (only with `onChange`). */
  step?: Bind<number>;
  /** `value` units per second the level advances by itself (0: still). */
  rate?: Bind<number>;
  /** When `value` was true, ms since the epoch; default: when the renderer got it. */
  at?: Bind<number>;
  /** Amplitude in px of the wave over the filled part; 0 flattens it (eased). It moves while not flat. */
  wave?: Bind<number>;
  /** Px per period, 26 by default. */
  wavelength?: Bind<number>;
  /** Radians per second, 7 by default. */
  speed?: Bind<number>;
  onChange?: On<{ value: number }>;
  /** Once, on release after a click or drag (seeking); the slider shows it until `value` changes. */
  onCommit?: On<{ value: number }>;
}
declare function Slider(props: SliderProps): ViewNode;

/** Floating content anchored below its parent (menus). Closes on outside click. */
interface PopupProps extends Keyed {
  open: Bind<boolean>;
  onDismiss?: On;
  width: Bind<number>;
  children?: Child;
}
declare function Popup(props: PopupProps): ViewNode;

/** Root of an entry: the window it draws into. */
interface SurfaceProps extends Keyed {
  layer?: "background" | "bottom" | "top" | "overlay";
  /** Edges the surface sticks to, e.g. "top left right". */
  anchor: string;
  width?: Bind<number>;
  /** Needed unless anchored to both top and bottom. */
  height?: Bind<number>;
  /** Margins from the anchored edges. */
  margin?: Sides;
  /** Space reserved so windows do not cover it. */
  exclusive?: number;
  visible?: Bind<boolean>;
  /** "exclusive": take the keyboard while shown (a launcher). */
  keyboard?: "on-demand" | "exclusive";
  /**
   * Clicking outside the surface calls this (panels). Clicks on the space
   * other surfaces reserve (the bar) reach them instead.
   */
  onDismiss?: On;
  children?: Child;
}
declare function Surface(props: SurfaceProps): ViewNode;

declare function h(type: unknown, props: unknown, ...children: unknown[]): ViewNode;
declare const Fragment: unique symbol;

declare namespace JSX {
  type Element = ViewNode;
  // A component may return a binding: `return () => cond() ? <A /> : null`.
  type ElementType = string | ((props: any) => Child);
  interface IntrinsicAttributes extends Keyed {}
  interface ElementChildrenAttribute {
    children: {};
  }
}
