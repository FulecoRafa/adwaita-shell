# adwaita-shell: a tessela project plus its services. Builds adwaita-services
# (services/, Rust, on tessela's SDK), installs the project to
# share/adwaita-shell with tessela.toml pointing at that binary, and a
# bin/adwaita-shell that runs it with tessela, with the tools the services
# call on PATH.
{
  lib,
  rustPlatform,
  makeWrapper,
  tessela,
  # What the services run. Only the CLIs: PipeWire, NetworkManager, BlueZ,
  # logind, power-profiles-daemon and the D-Bus session are services the
  # system has to provide (the services talk to most of them over D-Bus).
  wireplumber, # wpctl (audio)
  pipewire, # pw-dump (audio)
  networkmanager, # nmcli (network actions)
  bluez, # bluetoothctl (network actions)
  brightnessctl, # brightnessctl (brightness)
}:

let
  tools = [
    wireplumber
    pipewire
    networkmanager
    bluez
    brightnessctl
  ];
in
rustPlatform.buildRustPackage {
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
      ../services/Cargo.toml
      ../services/Cargo.lock
      ../services/src
    ];
  };

  # services/Cargo.toml takes the SDK from a sibling checkout,
  # ../../tessela/sdk/rust: put the source tessela was built from there.
  postUnpack = ''
    cp -r ${tessela.src} tessela
    chmod -R u+w tessela
  '';

  cargoRoot = "services";
  buildAndTestSubdir = "services";
  cargoLock.lockFile = ../services/Cargo.lock;

  postInstall = ''
    install -Dm755 -t $out/libexec/adwaita-shell $out/bin/adwaita-services
    rm -r $out/bin

    share=$out/share/adwaita-shell
    mkdir -p $share
    cp -r tessela.toml tsconfig.json src kit assets types $share
    # The services run from the store, not from services/target.
    substituteInPlace $share/tessela.toml --replace-fail \
      'command = ["services/target/release/adwaita-services"]' \
      "command = [\"$out/libexec/adwaita-shell/adwaita-services\"]"
    install -Dm644 -t $out/share/doc/adwaita-shell README.md
    install -Dm644 -t $out/share/licenses/adwaita-shell LICENSE-MIT LICENSE-APACHE

    # The host's tools before ours, so the CLIs match the daemons the
    # system runs.
    makeWrapper ${lib.getExe tessela} $out/bin/adwaita-shell \
      --add-flags "run $share" \
      --suffix PATH : ${lib.makeBinPath tools}

    install -Dm644 ${./adwaita-shell.service} $out/lib/systemd/user/adwaita-shell.service
    substituteInPlace $out/lib/systemd/user/adwaita-shell.service \
      --replace-fail @bindir@ $out/bin
  '';

  nativeBuildInputs = [ makeWrapper ];

  meta = {
    description = "Desktop shell for Hyprland (bar, panels, launcher, drawer), a tessela project";
    license = with lib.licenses; [ mit asl20 ];
    mainProgram = "adwaita-shell";
    platforms = lib.platforms.linux;
  };
}
