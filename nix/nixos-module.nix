# NixOS: programs.adwaita-shell.enable installs the shell for every user and
# starts it with their graphical session (the packaged systemd user unit).
self:
{ config, lib, pkgs, ... }:

let
  cfg = config.programs.adwaita-shell;
  packages = self.packages.${pkgs.stdenv.hostPlatform.system};
in
{
  options.programs.adwaita-shell = {
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
      description = "Install the theme's fonts: CaskaydiaCove Nerd Font and Phosphor-Fill.";
    };
  };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ cfg.package ];
    systemd.packages = [ cfg.package ];
    systemd.user.services.adwaita-shell.wantedBy = [ "graphical-session.target" ];

    fonts.packages = lib.optionals cfg.fonts [
      pkgs.nerd-fonts.caskaydia-cove
      packages.phosphor-icons-fill
    ];
  };
}
