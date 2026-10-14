# Nix

`flake.nix` exports:

| output | what |
|---|---|
| `packages.<system>.adwaita-shell` (= `default`) | the project in `share/adwaita-shell`, `bin/adwaita-shell`, a systemd user unit |
| `packages.<system>.phosphor-icons-fill` | the icon font the kit draws with |
| `apps.<system>.default` | `nix run` starts the shell |
| `overlays.default` | adds `pkgs.adwaita-shell` |
| `homeManagerModules.default` | `services.adwaita-shell.enable` |
| `nixosModules.default` | `programs.adwaita-shell.enable` |
| `checks.<system>` | the package, and `tsc` over the TSX |

The `tessela` input is the local checkout (`git+file:///home/fuleco/Dev/tessela`),
locked to a commit, so evaluation stays pure. After committing in tessela,
`nix flake lock --update-input tessela` picks it up. Once tessela is
published, set `inputs.tessela.url = "github:<owner>/tessela"` and relock.

## The package

```
bin/adwaita-shell                       exec tessela run $out/share/adwaita-shell "$@"
share/adwaita-shell/                    tessela.toml, src/, kit/, assets/, types/, plugins/
share/systemd/user/adwaita-shell.service   (lib/systemd/user links to it)
share/doc/adwaita-shell/README.md
share/licenses/adwaita-shell/LICENSE-{MIT,APACHE}
```

- The plugins are byte-compiled at build time: the store is read-only, and
  nothing else is written next to the project (sockets go to
  `$XDG_RUNTIME_DIR/tessela/adwaita-shell/`, state to `$XDG_STATE_HOME`, caches
  to `$XDG_CACHE_HOME`).
- The wrapper puts the package's `python3` first on `PATH`, and *appends* the
  CLIs the plugins call, so the host's own versions (matching its daemons)
  win: `wpctl` (wireplumber), `pw-dump` (pipewire), `nmcli` (networkmanager),
  `bluetoothctl` (bluez), `ip` (iproute2), `playerctl`, `busctl` and
  `systemd-inhibit` (systemd), `powerprofilesctl` (power-profiles-daemon),
  `brightnessctl`.
- Not provided, the system has to run them: NetworkManager, BlueZ, PipeWire
  with WirePlumber, power-profiles-daemon, a session D-Bus, Hyprland. The
  `ai` plugin calls `ai-usage`, which is not packaged; without it the AI chip
  stays empty. Apps the UI launches (ghostty, yazi, btop, hyprctl, uwsm...)
  come from the session's `PATH`.
- Fonts: the theme uses CaskaydiaCove Nerd Font and Phosphor-Fill; both
  modules install them (`fonts = false` to skip).

## Home Manager

```nix
# flake inputs
adwaita-shell.url = "git+file:///home/fuleco/Dev/adwaita-shell";

# a home-manager module
imports = [ inputs.adwaita-shell.homeManagerModules.default ];
services.adwaita-shell.enable = true;
```

This adds a user service started with `graphical-session.target` (change it
with `services.adwaita-shell.target`). The compositor has to export
`WAYLAND_DISPLAY` to the systemd user manager (uwsm and Hyprland's
`exec-once = dbus-update-activation-environment --systemd ...` do).
