# adwaita-shell

The desktop shell running on this machine (the Quickshell config `fuleco`),
rebuilt as a [tessela](../tessela) project: sandboxed TSX, structured like a
React app.

```
tessela.toml        surfaces (entries), capabilities, plugins, packages, theme files
kit/                the reusable package (@kit): components, widgets, data, theme
src/surfaces/       entries, one per window: bar, drawer, launcher
src/cards/          drawer cards, each drawn small (1×1), wide (2×1) or large (2×2)
src/components/     the shell's own pieces (the AI quota chip)
src/data/           the shell's data: panels, workspaces, status, drawer
plugins/            services the shell ships (started by the runner)
types/tessela.d.ts  the framework API, for the editor
```

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
