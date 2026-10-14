# Flatpak

`io.github.fuleco.AdwaitaShell.yml` builds one app with everything in it:
the tessela runner (from tessela's own module file, `../tessela` next to
this repository), the Phosphor icon font, the services
(`adwaita-services`, built from `services/` with tessela's SDK from the same
sibling checkout, installed to `/app/libexec/adwaita-shell`) and the project
under `/app/share/adwaita-shell`, its `tessela.toml` pointing at that
binary. Its command, `adwaita-shell`
(`adwaita-shell.sh`), runs `tessela run /app/share/adwaita-shell "$@"`.

**Prefer the RPM or the Nix package.** A desktop shell needs most of the
host, so this sandbox is nominal: the app may run any command on the host.
The Flatpak exists for systems where installing packages is not an option
(e.g. an immutable distribution without layering).

## Building and running

Needs `org.freedesktop.Platform//26.08`, its SDK and
`org.freedesktop.Sdk.Extension.rust-stable//26.08` (from Flathub; about
1.6 GB together with the GL extensions), `flatpak-builder` and
`appstreamcli`. Build outside the repository:

```sh
flatpak-builder --user --install-deps-from=flathub --install --force-clean \
    --state-dir ~/.cache/flatpak-builder ~/build/adwaita-shell \
    packaging/flatpak/io.github.fuleco.AdwaitaShell.yml
flatpak run io.github.fuleco.AdwaitaShell
```

The services' crates come from `services-cargo-sources.json`; regenerate it
whenever `services/Cargo.lock` changes (the generator is described in
`../tessela/packaging/flatpak/README.md`):

```sh
python3 flatpak-cargo-generator.py services/Cargo.lock \
    -o packaging/flatpak/services-cargo-sources.json
```

`flatpak run --command=tessela io.github.fuleco.AdwaitaShell --help` runs the
bundled runner. To start the shell with the session, a user unit
(`~/.config/systemd/user/adwaita-shell.service`):

```ini
[Unit]
Description=adwaita-shell (Flatpak)
PartOf=graphical-session.target
After=graphical-session.target

[Service]
ExecStart=/usr/bin/flatpak run io.github.fuleco.AdwaitaShell
Restart=on-failure
RestartSec=2

[Install]
WantedBy=graphical-session.target
```

or `exec-once = flatpak run io.github.fuleco.AdwaitaShell` in hyprland.conf.

## How the sandbox is opened, and why

| need | how |
|---|---|
| layer-shell surfaces | **not** `--socket=wayland`. Flatpak hands that socket out through `wp_security_context_v1`, and both Hyprland and sway then hide `zwlr_layer_shell_v1` (and Hyprland's own protocols) from the app: verified with `wayland-info` inside the sandbox (Hyprland: 71 globals outside, 40 inside; sway: 57 and 37). Instead the app gets the compositor's own socket, `--filesystem=xdg-run/wayland-0` and `wayland-1`, and the wrapper sets `WAYLAND_DISPLAY` again (Flatpak unsets it when the app has no `--socket=wayland`). For another socket name: `flatpak run --filesystem=xdg-run/wayland-2 --env=ADWAITA_SHELL_WAYLAND_DISPLAY=wayland-2 io.github.fuleco.AdwaitaShell`. |
| GPU | `--device=dri`; Mesa comes from the runtime's GL extension. |
| the services' tools and the apps the shell launches | `--talk-name=org.freedesktop.Flatpak`: everything runs on the host through `flatpak-spawn --host --watch-bus` (`host-command`). The tools the services and the power strip call (`pw-dump`, `wpctl`, `nmcli`, `bluetoothctl`, `brightnessctl`, `systemctl`, `loginctl`, `hyprctl`, `uwsm`) are links in `/app/lib/adwaita-shell/host-bin`, ahead of the runtime on `PATH`. At each start the wrapper also links every other command on the host's `PATH` that the runtime lacks, after the runtime, so desktop entries, pinned apps (`ghostty`, ...) and the optional `ai-usage` start on the host. `--watch-bus` kills the host process when its `flatpak-spawn` dies, so `pw-dump --monitor` never outlives the shell. |
| the services themselves | run inside (`/app/libexec/adwaita-shell/adwaita-services`) and talk D-Bus directly: the session bus, and on the system bus only `--system-talk-name` NetworkManager, BlueZ, logind (the caffeine inhibitor) and power-profiles-daemon (`org.freedesktop.UPower.PowerProfiles`, `net.hadess.PowerProfiles`). |
| Hyprland | `--filesystem=xdg-run/hypr` (IPC sockets; `HYPRLAND_INSTANCE_SIGNATURE` passes through). |
| tray, MPRIS, notifications | `--socket=session-bus` (unfiltered: the notifications service is a monitor connection, which the filtering proxy refuses). |
| weather | `--share=network`. |
| launcher entries and icons | `--filesystem=host-os:ro` (the host's `/usr` as `/run/host/usr`), the user's and Flatpak's exported `applications` and `icons`, and the GTK settings (icon theme). The wrapper adds them to `XDG_DATA_DIRS`. |
| agenda | `--filesystem=xdg-config/calcure:ro`. |
| battery, temperature, backlight, CPU, memory | `/sys/class` and `/proc` are visible in the sandbox; setting the backlight goes through `brightnessctl` on the host. |

## What still differs from a native install

- **Fonts**: the sandbox sees the runtime's fonts, the bundled Phosphor-Fill,
  `~/.local/share/fonts` and the host's `/usr/share/fonts`. "CaskaydiaCove Nerd
  Font" is not bundled; install it in `~/.local/share/fonts` (on NixOS, where
  fonts live in the Nix store, copy it to
  `~/.var/app/io.github.fuleco.AdwaitaShell/data/fonts`).
- **Desktop entries on NixOS** live in `/run/current-system/sw/share` and
  `/etc/profiles`, which the sandbox does not see; the launcher only lists
  Flatpak apps and `~/.local/share/applications` there.
- **Time zone on NixOS**: `/etc/localtime` points into the Nix store, Flatpak
  cannot resolve it and the clock shows UTC. Fix:
  `flatpak override --user --env=TZ=America/Sao_Paulo io.github.fuleco.AdwaitaShell`.
- **State and caches** move to `~/.var/app/io.github.fuleco.AdwaitaShell`
  (`$XDG_STATE_HOME`, `$XDG_CACHE_HOME`): notification history, saved shared
  state, media covers and the weather cache are not shared with a native
  install.
- **Disk usage** (the `system` module) measures the sandbox's root, not the
  host's.
- **devtools**: the runner's sockets are in the sandbox's private
  `$XDG_RUNTIME_DIR`; use `flatpak enter <instance> tessela devtools ...`.
  `--nested` needs sway, which the sandbox does not have.

## Verified

Built with flatpak-builder 1.4 against 26.08 and run on NixOS:
`flatpak run --command=tessela io.github.fuleco.AdwaitaShell --help`; a
`--headless` run; and the shell in a headless sway on its own socket
(`opened adwaita-shell-bar`, the bar drawn as natively, checked with a
screenshot). With the Rust services: a `--headless` run inside the sandbox
with a `get` on each of the nine sockets, all answering with live data
(audio through the host's `pw-dump`, network and power over the system bus
proxy, the AI quota from the host's `ai-usage`, weather over the network),
and no `pw-dump` left on the host afterwards.
