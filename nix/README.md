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
| `checks.<system>` | the package (its build runs the services' tests), and `tsc` over the TSX |

The `tessela` input is `github:FulecoRafa/tessela`, locked to a commit; the
services build on the SDK (`sdk/rust`) from that same input. Working on both
at once: `--override-input tessela git+file:///path/to/tessela`, or
`nix flake lock --update-input tessela` after pushing tessela.

## The package

```
bin/adwaita-shell                       exec tessela run $out/share/adwaita-shell "$@"
share/adwaita-shell/                    tessela.toml, src/, kit/, assets/, types/
libexec/adwaita-shell/adwaita-services  the services (services/, Rust)
share/systemd/user/adwaita-shell.service   (lib/systemd/user links to it)
share/doc/adwaita-shell/README.md
share/licenses/adwaita-shell/LICENSE-{MIT,APACHE}
```

- `adwaita-services` is built with `rustPlatform.buildRustPackage` from
  `services/Cargo.lock`; `services/Cargo.toml` takes the SDK from
  `../../tessela/sdk/rust`, so the build copies `tessela.src` (the source
  the runner was built from) there before cargo runs. The installed
  `tessela.toml` runs it by its store path instead of
  `services/target/release/adwaita-services`.
- Nothing is written next to the project (sockets go to
  `$XDG_RUNTIME_DIR/tessela/adwaita-shell/`, state to `$XDG_STATE_HOME`, caches
  to `$XDG_CACHE_HOME`).
- The wrapper *appends* the CLIs the services call to `PATH`, so the host's
  own versions (matching its daemons) win: `pw-dump` (pipewire), `wpctl`
  (wireplumber), `nmcli` (networkmanager), `bluetoothctl` (bluez),
  `brightnessctl`.
- Not provided, the system has to run them: a session D-Bus, PipeWire with
  WirePlumber, NetworkManager, BlueZ, logind, power-profiles-daemon
  (optional), a notification server, MPRIS players, Hyprland. The `ai`
  service calls `ai-usage`, which is not packaged; without it the AI chip
  stays empty. Apps the UI launches (ghostty, yazi, btop, hyprctl, uwsm...)
  come from the session's `PATH`.
- Fonts: the theme uses CaskaydiaCove Nerd Font and Phosphor-Fill; both
  modules install them (`fonts = false` to skip).

## Home Manager

```nix
# flake inputs
adwaita-shell.url = "github:FulecoRafa/adwaita-shell";

# a home-manager module
imports = [ inputs.adwaita-shell.homeManagerModules.default ];
services.adwaita-shell.enable = true;
```

This adds a user service started with `graphical-session.target` (change it
with `services.adwaita-shell.target`). The compositor has to export
`WAYLAND_DISPLAY` to the systemd user manager (uwsm and Hyprland's
`exec-once = dbus-update-activation-environment --systemd ...` do).
