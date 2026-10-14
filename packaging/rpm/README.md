# RPM (Fedora)

`adwaita-shell.spec` builds the services (`services/`, Rust) offline from
vendored crates and installs:

| path | what |
|---|---|
| `/usr/share/adwaita-shell/` | the project: `tessela.toml` (its `[plugins.services]` command patched to the binary below), `src/`, `kit/`, `assets/`, `types/` |
| `/usr/libexec/adwaita-shell/adwaita-services` | the services: agenda, ai, audio, brightness, media, network, notifications, power, weather, one socket each |
| `/usr/bin/adwaita-shell` | `exec tessela run /usr/share/adwaita-shell "$@"` (extra arguments go to `tessela run`: `--dev`, `--devtools`, `--nested`) |
| `/usr/lib/systemd/user/adwaita-shell.service` | starts the shell with `graphical-session.target` |
| `/usr/share/fonts/adwaita-shell/Phosphor-Fill.ttf` | the icon font the kit draws glyphs with |

It needs the `tessela` package (built from `../tessela/packaging/rpm`).

## Building

`services/Cargo.toml` takes tessela's SDK from `../../tessela/sdk/rust`, so
`make-sources.sh` also archives a tessela checkout (`../tessela` next to
this repository, or `TESSELA=<dir>`; `TESSELA_REF`, default `HEAD`) and
vendors `services/Cargo.lock` against it. It needs git, curl, cargo and xz:

```sh
nix develop ../tessela -c packaging/rpm/make-sources.sh ~/rpmbuild/SOURCES
#   adwaita-shell-0.1.0.tar.gz, Phosphor-Fill.ttf,
#   tessela-0.1.0.tar.xz (the same file tessela.spec builds from),
#   adwaita-shell-0.1.0-vendor.tar.xz (services/cargo-vendor)
sudo dnf builddep packaging/rpm/adwaita-shell.spec
rpmbuild -ba packaging/rpm/adwaita-shell.spec
sudo dnf install ~/rpmbuild/RPMS/x86_64/{adwaita-shell,tessela}-0.1.0-*.rpm
systemctl --user enable --now adwaita-shell.service   # or run `adwaita-shell`
```

`%prep` unpacks the tessela tarball to `../tessela` beside the source tree;
`%check` runs the services' tests (`--without check` skips them).

With Hyprland under uwsm, the unit starts with the session; otherwise put
`exec-once = adwaita-shell` in hyprland.conf instead of enabling the unit.

## Runtime dependencies

Commands the services run; the spec requires the files, so any package that
provides them will do:

| command | service | Fedora package |
|---|---|---|
| `pw-dump` | audio (follows `pw-dump --monitor`) | pipewire-utils |
| `wpctl` | audio (volume, mute, default device) | wireplumber |
| `nmcli` | network (actions) | NetworkManager |
| `bluetoothctl` | network (actions) | bluez |
| `brightnessctl` | brightness | brightnessctl |

D-Bus services they read: the session bus (notifications, through a monitor
connection, so some notification server must own
`org.freedesktop.Notifications`; MPRIS players), NetworkManager and BlueZ
(come with the commands above), logind (caffeine) and power-profiles-daemon
or `tuned-ppd` (recommended; without either the power profile stays empty).

Recommended, not required: `hyprland` (workspaces, windows, the power strip's
actions; the rest runs on any layer-shell compositor) and
`cascadia-mono-fonts`. The theme asks for "CaskaydiaCove Nerd Font", which
Fedora does not ship; without it fontconfig falls back to another font.
Commands that only some setups have are not dependencies: `ai-usage` (the AI
quota chip), `uwsm`, and the apps pinned in `src/data` (ghostty, zeditor, ...).

## License

`License:` is the project's `(MIT OR Apache-2.0) AND CC-BY-4.0 AND MIT` (the
project, the NixOS snowflake in `assets/` from nixos-artwork, the Phosphor
font) and the licenses of the crates linked into `adwaita-services`, from
`%cargo_license_summary` (rerun it when `services/Cargo.lock` changes). The
package ships `LICENSE.dependencies` and `cargo-vendor.txt`, from which rpm
generates the `bundled(crate(...))` provides.
