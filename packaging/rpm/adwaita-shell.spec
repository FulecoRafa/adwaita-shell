# adwaita-shell: a tessela project (no build step). Installs the project to
# /usr/share/adwaita-shell, an `adwaita-shell` command that runs it with
# tessela and a systemd user unit that starts it with the graphical session.
#
#   packaging/rpm/make-sources.sh ~/rpmbuild/SOURCES
#   rpmbuild -ba packaging/rpm/adwaita-shell.spec

Name:           adwaita-shell
Version:        0.1.0
Release:        1%{?dist}
Summary:        Desktop shell for Hyprland (bar, panels, launcher, drawer) built with tessela

# The project is MIT OR Apache-2.0; assets/nix-snowflake.svg (nixos-artwork)
# is CC-BY-4.0; the bundled Phosphor icon font is MIT.
License:        (MIT OR Apache-2.0) AND CC-BY-4.0 AND MIT
# Provisional: the project has no public home yet.
URL:            https://example.invalid/adwaita-shell
Source0:        %{name}-%{version}.tar.gz
# kit/components/Icon.tsx draws icons with the "Phosphor-Fill" font family.
Source1:        https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/Phosphor-Fill.ttf

BuildArch:      noarch
BuildRequires:  python3-devel
BuildRequires:  systemd-rpm-macros

Requires:       tessela
# The plugins (plugins/*.py) are Python 3 services; they call these tools.
# File dependencies, so whichever package provides the command satisfies it
# (e.g. tuned-ppd's powerprofilesctl on Fedora Workstation).
Requires:       python3
Requires:       /usr/bin/wpctl
Requires:       /usr/bin/pw-dump
Requires:       /usr/bin/nmcli
Requires:       /usr/bin/bluetoothctl
Requires:       /usr/bin/ip
Requires:       /usr/bin/playerctl
Requires:       /usr/bin/busctl
Requires:       /usr/bin/systemd-inhibit
Requires:       /usr/bin/powerprofilesctl
Requires:       /usr/bin/brightnessctl
%{?systemd_requires}
# Workspaces, windows and the power strip's actions talk to Hyprland; the
# rest of the shell runs on any wlroots compositor with layer-shell.
Recommends:     hyprland
# The theme's text font is "CaskaydiaCove Nerd Font", which Fedora does not
# ship; fontconfig falls back to another monospace font without it.
Recommends:     cascadia-mono-fonts

%description
adwaita-shell is a desktop shell for Hyprland written as a tessela project:
a bar, a control center, a notification center, an AI usage panel, a power
strip, a drawer of cards and a launcher, as sandboxed TSX surfaces, plus the
Python services that feed them (audio, network, bluetooth, media,
notifications, power, brightness, weather, agenda).

Start it with `adwaita-shell`, or with the session:
  systemctl --user enable --now adwaita-shell.service

%prep
%autosetup -n %{name}-%{version}

%build
# Nothing to build: tessela reads the TSX sources at runtime.

%install
share=%{buildroot}%{_datadir}/%{name}
install -d $share
cp -a tessela.toml tsconfig.json src kit assets types $share/
install -d $share/plugins
install -pm0644 plugins/*.py $share/plugins/
# The install is read-only for users: compile the plugins now, so Python does
# not try (and fail) to write __pycache__ next to them at every start.
%py_byte_compile %{python3} $share/plugins

install -Dpm0644 %{SOURCE1} %{buildroot}%{_datadir}/fonts/%{name}/Phosphor-Fill.ttf

install -d %{buildroot}%{_bindir}
cat > %{buildroot}%{_bindir}/%{name} << 'EOF'
#!/bin/sh
# Run adwaita-shell with tessela; extra arguments go to `tessela run`
# (e.g. --dev, --devtools, --nested).
exec tessela run %{_datadir}/%{name} "$@"
EOF
chmod 0755 %{buildroot}%{_bindir}/%{name}

install -d %{buildroot}%{_userunitdir}
cat > %{buildroot}%{_userunitdir}/%{name}.service << 'EOF'
[Unit]
Description=adwaita-shell (tessela desktop shell)
PartOf=graphical-session.target
After=graphical-session.target

[Service]
ExecStart=%{_bindir}/%{name}
Restart=on-failure
RestartSec=2

[Install]
WantedBy=graphical-session.target
EOF

%check
%{python3} -m py_compile plugins/*.py
grep -q '^name = "adwaita-shell"' %{buildroot}%{_datadir}/%{name}/tessela.toml

%post
%systemd_user_post %{name}.service

%preun
%systemd_user_preun %{name}.service

%files
%license LICENSE-MIT LICENSE-APACHE
%doc README.md NEEDS.md
%{_bindir}/%{name}
%{_datadir}/%{name}/
%{_datadir}/fonts/%{name}/
%{_userunitdir}/%{name}.service

%changelog
* Tue Oct 13 2026 Fuleco <fuleco.ra.pha@gmail.com> - 0.1.0-1
- First package
