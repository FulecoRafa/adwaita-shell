# adwaita-shell: a tessela project (no build step). Installs the project to
# share/adwaita-shell and a bin/adwaita-shell that runs it with tessela, with
# the tools its plugins call on PATH.
{
  lib,
  stdenvNoCC,
  makeWrapper,
  tessela,
  python3,
  # What plugins/*.py run. Only the CLIs: NetworkManager, BlueZ, PipeWire,
  # power-profiles-daemon and the D-Bus session are services the system
  # has to provide.
  wireplumber, # wpctl (audio)
  pipewire, # pw-dump (audio)
  networkmanager, # nmcli (network)
  bluez, # bluetoothctl (network)
  iproute2, # ip (network)
  playerctl, # playerctl (media)
  systemd, # busctl (notifications, media), systemd-inhibit (power)
  power-profiles-daemon, # powerprofilesctl (power)
  brightnessctl, # brightnessctl (brightness)
}:

let
  tools = [
    wireplumber
    pipewire
    networkmanager
    bluez
    iproute2
    playerctl
    systemd
    power-profiles-daemon
    brightnessctl
  ];
in
stdenvNoCC.mkDerivation {
  pname = "adwaita-shell";
  version = "0.1.0";

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../tessela.toml
      ../tsconfig.json
      ../README.md
      ../LICENSE-MIT
      ../LICENSE-APACHE
      ../src
      ../kit
      ../assets
      ../types
      (lib.fileset.fileFilter (f: f.hasExt "py") ../plugins)
    ];
  };

  nativeBuildInputs = [
    makeWrapper
    python3
  ];

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    share=$out/share/adwaita-shell
    mkdir -p $share
    cp -r tessela.toml tsconfig.json src kit assets types plugins $share
    install -Dm644 -t $out/share/doc/adwaita-shell README.md
    install -Dm644 -t $out/share/licenses/adwaita-shell LICENSE-MIT LICENSE-APACHE
    # The store is read-only: compile the plugins now, so Python does not try
    # to write __pycache__ next to them. Unchecked: store files have no mtime.
    python3 -m compileall -q --invalidation-mode unchecked-hash $share/plugins

    # The project's own python3 first; the host's tools before ours, so the
    # CLIs match the daemons the system runs.
    makeWrapper ${lib.getExe tessela} $out/bin/adwaita-shell \
      --add-flags "run $share" \
      --prefix PATH : ${lib.makeBinPath [ python3 ]} \
      --suffix PATH : ${lib.makeBinPath tools}

    install -Dm644 ${./adwaita-shell.service} $out/lib/systemd/user/adwaita-shell.service
    substituteInPlace $out/lib/systemd/user/adwaita-shell.service \
      --replace-fail @bindir@ $out/bin

    runHook postInstall
  '';

  meta = {
    description = "Desktop shell for Hyprland (bar, panels, launcher, drawer), a tessela project";
    license = with lib.licenses; [ mit asl20 ];
    mainProgram = "adwaita-shell";
    platforms = lib.platforms.linux;
  };
}
