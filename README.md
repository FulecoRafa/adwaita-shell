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
plugins/            services the shell ships (started by the runner)
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
tessela run ../adwaita-shell --dev        # below the desktop's bar, reserving nothing
tessela run ../adwaita-shell --nested     # in a headless compositor of its own
tessela run ../adwaita-shell --devtools   # then: tessela devtools --help
```

Type-check: `nix shell nixpkgs#typescript --command tsc -p .`

## License

Licensed under either of the [Apache License 2.0](LICENSE-APACHE) or the
[MIT license](LICENSE-MIT), at your option.

`assets/nix-snowflake.svg` is the NixOS snowflake from
[nixos-artwork](https://github.com/NixOS/nixos-artwork), CC-BY 4.0, recolored.
