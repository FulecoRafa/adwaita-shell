# adwaita-shell

The desktop shell running on this machine (the Quickshell config `fuleco`),
rebuilt as a [tessela](../tessela) project: sandboxed TSX, structured like a
React app.

```
tessela.toml        surfaces (entries), capabilities, plugins, packages, theme files
kit/                the reusable package (@kit): components, widgets, data, theme
src/surfaces/       entries, one per window: bar, drawer
src/cards/          drawer cards, each drawn small (1×1), wide (2×1) or large (2×2)
src/components/     the shell's own pieces (the AI quota chip)
src/data/           the shell's data: panels, workspaces, status, drawer
plugins/            services the shell ships (started by the runner)
types/tessela.d.ts  the framework API, for the editor
```

`NEEDS.md` lists what the framework had to gain for this project.

Type-check: `nix shell nixpkgs#typescript --command tsc -p .`
