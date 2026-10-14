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
| Overlays let clicks on the bar through (input region minus reserved space) | a bar button switches or closes the open panel, like the reference |
| `Slider`: click, drag and wheel set a 0..1 level | volume, microphone, brightness, per-app volume |
| `Slider` `rate`/`at`, `wave`, `onCommit`; `Image` `radius`/`fit` (tessela ADR 0021) | media progress that advances and waves with no guest code, seeking; rounded, cropped covers |
| `Box.maxHeight` (with `scroll`) | wifi and bluetooth lists that grow, then scroll |
| `Label.wrap` / `lines` | notification bodies, error messages |
| `Input.secret` | wifi password |
| The innermost clickable box takes the click | close button on a clickable notification card |
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
services directory and restarts it when it dies. This project ships one,
`services/` (Rust, on tessela's SDK; tessela ADR 0022): one process serving
every socket below, on events where the system has them (see README).

| Service | Source |
|---|---|
| `audio` | volume and mute of the default sink and source, outputs, inputs and app streams (`pw-dump --monitor`, set with `wpctl`); set default, per-app volume |
| `network` | wifi, wired and bluetooth state, wifi networks, bluetooth devices (NetworkManager and BlueZ over D-Bus; actions with `nmcli`, `bluetoothctl`); radios on/off, connect/disconnect/forget, pair, discovery |
| `notifications` | history (a D-Bus monitor connection), dismiss and clear through the running server, do-not-disturb |
| `ai` | Claude and Codex quota windows and a 7-day history of daily peaks (`ai-usage show`) |
| `brightness` | backlight level (sysfs, `brightnessctl`) |
| `media` | MPRIS players (D-Bus): the last one that started playing, or one picked by hand; covers saved to `~/.cache/tessela/adwaita-shell/art`; seek |
| `weather` | current conditions and next hours (wttr.in, cached) |
| `power` | power profile (power-profiles-daemon over D-Bus), caffeine (a logind idle inhibitor) |
| `agenda` | calcure events (inotify) |

## Still open

- Keyboard navigation in lists (arrow keys in the launcher): the vocabulary
  has no key events besides `Input`'s change and submit.
- The launcher is minimal next to the reference (no scopes, calculator,
  emoji, terminal apps).
- Notifications: the desktop's shell owns `org.freedesktop.Notifications`, so
  the plugin observes the bus: the history starts when it starts, actions
  cannot be invoked (only the server can emit `ActionInvoked`), popups and
  do-not-disturb stay the desktop shell's. Taking over the server is now
  possible (the services speak D-Bus through zbus); not done yet.
- A surface whose render runs past the guest's CPU budget (50 ms) while it
  hot-reloads with the panel open crashed the whole process (SIGSEGV in a
  QuickJS finalizer, `JS_Call` from a worker). Not reproduced in a unit test
  yet; the control center avoids it by listing at most 24 networks.
- Hover-only content (the notification card's close button, the power
  buttons' captions) and focus styles (the password field's yellow border):
  shown always, or as a tooltip.
- Bar app tiles: right click opens the App Exposé in the reference; there is
  no Expo surface yet.
- Animations (width/color transitions, the pulsing AI chip, sliding panels).
  The first one, the media card's moving wave, runs in the renderer
  (tessela ADR 0021); the rest should follow the same path.
- The media wave has a fixed amplitude; the reference follows the audio
  level (cava).
- Drag to reorder drawer cards (edit mode uses ↑/↓ buttons).
- Time zones in the sandbox (the world clock uses fixed offsets).
- Surfaces of the reference shell not rebuilt yet: notification popups,
  OSD, HUD, capture, alt-tab, expo, monitor manager, polkit agent,
  wallpaper.
