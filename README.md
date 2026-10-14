# adwaita-shell

The desktop shell running on this machine (the Quickshell config `fuleco`),
rebuilt as a [tessela](../tessela) project: sandboxed TSX, structured like a
React app.

```
tessela.toml        surfaces (entries), capabilities, plugins, packages, theme files
kit/                the reusable package (@kit): components, widgets, data, theme
src/surfaces/       entries, one per window: bar, control center, notifications,
                    AI usage, power strip, drawer, launcher
src/cards/          drawer cards, each drawn small (1×1), wide (2×1) or large (2×2)
src/components/     the shell's own pieces (the AI quota chip)
src/data/           the shell's data: panels, workspaces, status, drawer
services/           the services the shell ships (audio, network, media...): one
                    Rust process, started by the runner
types/tessela.d.ts  the framework API, for the editor
```

Every piece of the bar opens what it opens in the reference: the logo, the
network, bluetooth and volume icons the control center (on its rede/som
tab), the bell the notification center, the cc/cx chip the AI usage panel,
the clock the power strip, the battery and calendar the drawer. Panels hang
from the bar and close on an outside click; a click on the bar goes to the
bar, so another button switches panels.

The launcher is built only from `@kit`, the same pieces as the bar: see
`kit/README.md` for what the kit offers and its rules.

`NEEDS.md` lists what the framework had to gain for this project.

## Running

From `../tessela`, inside `nix develop`:

```sh
cargo build --release --manifest-path ../adwaita-shell/services/Cargo.toml   # once, and after changing services/
tessela run ../adwaita-shell --dev        # below the desktop's bar, reserving nothing
tessela run ../adwaita-shell --nested     # in a headless compositor of its own
tessela run ../adwaita-shell --devtools   # then: tessela devtools --help
```

Type-check: `nix shell nixpkgs#typescript --command tsc -p .`

Installed, `adwaita-shell` runs the project with the services prebuilt
(`tessela.toml` points at the installed binary): `nix build` / the Home
Manager and NixOS modules (`nix/README.md`), an RPM
(`packaging/rpm/README.md`) or a Flatpak (`packaging/flatpak/README.md`).
All three build `services/` against `../tessela/sdk/rust`, so they need
tessela's source next to this one (Nix takes it from the `tessela` input).

## Services

`services/` builds one binary, `adwaita-services`, on tessela's Rust SDK
(`../tessela/sdk/rust`). Each module serves its own socket (`audio.sock`,
`network.sock`, ...) with the topics and methods `src/data` uses, all on one
thread, and waits for events instead of polling where the system has them:

| Service | Reads | Changes with |
|---|---|---|
| `audio` | `pw-dump --monitor` (every change, no polling) | `wpctl` |
| `network` | NetworkManager and BlueZ on the system bus, when they signal | `nmcli`, `bluetoothctl` |
| `notifications` | a D-Bus monitor on the session bus; history in `$XDG_STATE_HOME/adwaita-shell` | `CloseNotification` |
| `media` | MPRIS players over D-Bus (properties, Seeked; the position while playing) | MPRIS methods |
| `power` | power-profiles-daemon over D-Bus | its `ActiveProfile`; caffeine is a logind idle inhibitor |
| `brightness` | sysfs, every 2 s | `brightnessctl` |
| `agenda` | `~/.config/calcure/events.csv` (inotify) | |
| `ai` | `ai-usage show`, every 5 min | |
| `weather` | wttr.in, every 30 min (cached) | |

The runner starts it (`[plugins.services]` in `tessela.toml`), waits for
its sockets and restarts it if it dies. Tests: `cargo test --manifest-path
services/Cargo.toml`.

## License

Licensed under either of the [Apache License 2.0](LICENSE-APACHE) or the
[MIT license](LICENSE-MIT), at your option.

`assets/nix-snowflake.svg` is the NixOS snowflake from
[nixos-artwork](https://github.com/NixOS/nixos-artwork), CC-BY 4.0, recolored.
