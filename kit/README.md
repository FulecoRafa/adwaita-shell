# @kit

The reusable part of adwaita-shell: what a bar, a launcher, a dock or a
dashboard built on tessela can share. The shell's own code lives in `src/`.

```toml
# tessela.toml of any project
themes = ["../adwaita-shell/kit/theme.toml"]

[imports]
kit = "../adwaita-shell/kit"
```

```tsx
import { AppTile } from "@kit/components/AppTile";
import * as apps from "@kit/data/apps";
```

## Rules

- Nothing here imports from `src/` (or from any app). Apps import the kit.
- Components take everything through props: data, sizes, callbacks. They
  read no module and no shared state, so any surface can use them.
- Widgets (`widgets/`) are the exception by design: self-contained pieces
  that read a module themselves (the tray reads `tray`).
- Data (`data/`) wraps modules for reuse; every accessor is lazy, so an app
  only needs the capabilities of what it reads.
- Colors are theme tokens (`"$surface"`) from `theme.toml`.

## Contents

| | |
|---|---|
| `components/` | `Icon` (Phosphor glyphs), `AppTile` (bar tile or labelled grid tile), `StatusIcon` (with badge), `Chip`, `Tag`, `Gauge`, `Clock`, `Divider`, `Menu` (dbusmenu-style, submenus), `Card` + `Level` (three sizes), `MediaPlayer` (cover, titles, player chips, a wavy progress line that moves in the renderer and seeks), `Workspaces`, `SearchField`, `ListRow`; for panels: `HangingPanel` (a surface hanging from a bar), `Toggle`, `ToggleCard`, `SectionTitle`, `Meter` + `LevelRow` (draggable level with icon and percent), `SelectRow`, `DisclosureRow` (row that opens in place), `ActionButton`, `RoundButton`, `NotificationCard` |
| `widgets/` | `Tray`: StatusNotifierItems with their menus (capability `tray`) |
| `data/` | `apps`: installed apps, search ranked by use, pins, launch, icon of a window class (`apps`, `apps:launch`, `state`); `tray` |
| `lib/` | `bind` (static-or-reactive props), `format` (pt-BR dates, durations), `glyphs` (Phosphor fill) |
| `theme.toml` | dark (Ayu Mirage) and light tokens |
