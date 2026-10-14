{
  description = "adwaita-shell — a desktop shell for Hyprland, as a tessela project";

  inputs = {
    # The runner. A local checkout until tessela is published; pure evaluation
    # works because it is locked to a commit. Once published, switch to e.g.
    #   tessela.url = "github:<owner>/tessela";
    # and run `nix flake lock --update-input tessela`.
    tessela.url = "git+file:///home/fuleco/Dev/tessela";
    nixpkgs.follows = "tessela/nixpkgs";
  };

  outputs =
    { self, nixpkgs, tessela }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f system nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAll (
        system: pkgs: rec {
          adwaita-shell = pkgs.callPackage ./nix/package.nix {
            inherit (tessela.packages.${system}) tessela;
          };
          phosphor-icons-fill = pkgs.callPackage ./nix/phosphor-icons-fill.nix { };
          default = adwaita-shell;
        }
      );

      apps = forAll (
        system: _pkgs: {
          default = {
            type = "app";
            program = nixpkgs.lib.getExe self.packages.${system}.adwaita-shell;
            meta.description = "Run adwaita-shell";
          };
        }
      );

      overlays.default = final: _prev: {
        adwaita-shell = final.callPackage ./nix/package.nix {
          tessela = tessela.packages.${final.stdenv.hostPlatform.system}.tessela;
        };
      };

      homeManagerModules.default = import ./nix/hm-module.nix self;
      nixosModules.default = import ./nix/nixos-module.nix self;

      # The package (whose build byte-compiles the plugins, so a syntax error
      # fails it) and a type-check of the TSX against types/tessela.d.ts.
      checks = forAll (
        system: pkgs: {
          package = self.packages.${system}.adwaita-shell;
          typescript =
            pkgs.runCommand "adwaita-shell-tsc" { nativeBuildInputs = [ pkgs.typescript ]; } ''
              cp -r ${self.packages.${system}.adwaita-shell}/share/adwaita-shell src
              chmod -R u+w src && cd src
              tsc -p . && touch $out
            '';
        }
      );
    };
}
