# What this project needs from tessela

Written while building the shell against the API we wanted, with mock data
in `src/data/`. `types/tessela.d.ts` is the contract; this was the gap list
between it and tessela at commit `bd6a31d`.

**Status:** everything in the tables below now exists in tessela, plus what
building and validating the shell asked for along the way: `memo()`,
packages (`@kit`, `[imports]`) and theme files, hidden surfaces costing
nothing, devtools, and `--nested` previews. What is still open is at the
end.

## Projects, not single files

- **Relative imports between project files.** Today the JS engine evaluates
  one entry with no module loader. Needed: ES imports resolved inside the
  project root (never outside it), each file transpiled from TS/TSX, hot
  reload when any imported file changes.
- **A project manifest** (`tessela.toml`): several surfaces, each an entry
  with its own capabilities; a project font; theme tokens per color scheme;
  plugins to start.
- **A runner** that takes a project directory, so this repo has no Rust.

## Rendering

| Need | Why |
|---|---|
| `Surface` root: layer, anchors, size, margins, exclusive zone, reactive `visible`, `onDismiss` | bar and drawer are different layer-shell windows; panels open and close |
| `Box` with style: direction, gap, padding, align/justify, px or % sizes, grow, background, border, radius per corner, opacity | every visual detail lives in components, not in the renderer |
| `hoverBg` / `hoverOpacity` / `tooltip` drawn by the renderer | hover feedback without a round trip to guest code |
| `place` (absolute position inside the parent) | running dot under an app tile, notification badge over the bell |
| `scroll` | the drawer is taller than the screen |
| `Label`: color, size, weight, font, ellipsis at `maxWidth` | text styles; icon glyphs are a `Label` in the Phosphor font |
| `Image`: `asset:`, `icon:` (theme lookup) and module-provided sources, PNG and SVG | logo, app icons, tray icons, album covers |
| `Ring` with centered children | CPU gauge |
| `Popup`: anchored below its parent, closes on outside click | tray menu |
| `Input`: one line of text, `onChange`/`onSubmit`, keyboard focus | task draft; the launcher's search field later |
| Right and middle click | tray items (menu, secondary action) |
| Theme tokens (`"$surface"`) resolved per color scheme | dark/light without rebinding every color prop |

## Data (modules, in-process)

| Module | Provides |
|---|---|
| `context` → `ctx` | user, hostname, home, locale, desktop, surface name, `colorScheme()` from the portal, `screen()`, `now(precision)` |
| `state` → `shared(key, initial, {store})` | values shared by all surfaces (open panel); optionally saved to disk (drawer layout, tasks, timers) |
| `hyprland` | workspaces, clients, keyboard layout, from the IPC event socket; `dispatch` behind `hyprland:dispatch` |
| `system` | CPU (with history), memory, disk, temperature, battery from `/proc` and `/sys` |
| `apps` | desktop entry for a window class, icon theme lookup, `launch` behind `apps:launch` |
| `tray` | StatusNotifierItems through the session's existing watcher, dbusmenu menus, activate/secondary/scroll/trigger |

## Services (plugins, out of process)

The runner starts each `[plugins.<name>]` command, points it at the
services directory and restarts it when it dies. This project ships:

| Plugin | Source |
|---|---|
| `audio` | default sink volume/mute (`wpctl`) |
| `network` | wifi, wired and bluetooth state (`nmcli`, `bluetoothctl`) |
| `notifications` | count and do-not-disturb from the running notification server |
| `ai` | Claude and Codex quota windows (`ai-usage show`) |
| `media` | MPRIS player (`playerctl`) |
| `weather` | current conditions and next hours (wttr.in, cached) |
| `power` | power profile (`powerprofilesctl`) |
| `agenda` | calcure events |

## Still open

- Keyboard navigation in lists (arrow keys in the launcher): the vocabulary
  has no key events besides `Input`'s change and submit.
- The launcher is minimal next to the reference (no scopes, calculator,
  emoji, terminal apps).
- Notifications: the desktop's shell owns `org.freedesktop.Notifications`, so
  the plugin observes the bus and counts what arrives after it starts. Taking
  over the server needs a D-Bus binding the Python stdlib lacks.
- Plugins run `python3` from `PATH` (the dev shell has it; the desktop
  session on NixOS does not).
- Animations (width/color transitions, the pulsing AI chip, sliding panels).
- Drag to reorder drawer cards (edit mode uses ↑/↓ buttons).
- Time zones in the sandbox (the world clock uses fixed offsets).
- Surfaces of the reference shell not rebuilt yet: control center,
  notification center, OSD, HUD, capture, alt-tab, expo, polkit agent, AI
  panel, wallpaper.
