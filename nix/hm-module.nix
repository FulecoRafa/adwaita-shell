# Home Manager: services.adwaita-shell.enable installs the shell and starts it
# with the graphical session (a systemd user service).
self:
{ config, lib, pkgs, ... }:

let
  cfg = config.services.adwaita-shell;
  packages = self.packages.${pkgs.stdenv.hostPlatform.system};
in
{
  options.services.adwaita-shell = {
    enable = lib.mkEnableOption "adwaita-shell, a desktop shell for Hyprland built with tessela";

    package = lib.mkOption {
      type = lib.types.package;
      default = packages.adwaita-shell;
      defaultText = lib.literalExpression "adwaita-shell.packages.\${system}.adwaita-shell";
      description = "The adwaita-shell package (it brings its own tessela).";
    };

    fonts = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Install the fonts the theme asks for: CaskaydiaCove Nerd Font (text)
        and Phosphor-Fill (icons). Without them text falls back to another
        font and icons do not show.
      '';
    };

    target = lib.mkOption {
      type = lib.types.str;
      default = "graphical-session.target";
      description = "The systemd user target that starts and stops the shell.";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [
      cfg.package
    ]
    ++ lib.optionals cfg.fonts [
      pkgs.nerd-fonts.caskaydia-cove
      packages.phosphor-icons-fill
    ];

    fonts.fontconfig.enable = lib.mkIf cfg.fonts (lib.mkDefault true);

    systemd.user.services.adwaita-shell = {
      Unit = {
        Description = "adwaita-shell (tessela desktop shell)";
        PartOf = [ cfg.target ];
        After = [ cfg.target ];
      };
      Service = {
        ExecStart = lib.getExe cfg.package;
        Restart = "on-failure";
        RestartSec = 2;
      };
      Install.WantedBy = [ cfg.target ];
    };
  };
}
