# adwaita-shell

The desktop shell running on this machine (the Quickshell config `fuleco`),
rebuilt as a [tessela](../tessela) project: sandboxed TSX, structured like a
React app.

```
tessela.toml          surfaces (entries), capabilities, plugins, theme tokens
src/surfaces/         entries — one per window: bar.tsx, drawer.tsx
src/components/       the component library: props in, view out
src/components/cards/ drawer cards, each drawn small (1×1), wide (2×1) or large (2×2)
src/data/             the only code that talks to modules and services
src/lib/              formatting, icon glyphs, binding helpers
plugins/              services the shell ships (started by the runner)
types/tessela.d.ts    the framework API, for the editor
```

`NEEDS.md` lists what the framework had to gain for this project.

Type-check: `nix shell nixpkgs#typescript --command tsc -p .`
