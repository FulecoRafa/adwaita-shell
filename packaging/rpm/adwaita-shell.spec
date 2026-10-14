# adwaita-shell: a tessela project plus its services. Builds adwaita-services
# (services/, Rust, on tessela's SDK) offline from vendored crates, installs
# the project to /usr/share/adwaita-shell with tessela.toml pointing at that
# binary, an `adwaita-shell` command that runs it with tessela and a systemd
# user unit that starts it with the graphical session.
#
#   packaging/rpm/make-sources.sh ~/rpmbuild/SOURCES
#   rpmbuild -ba packaging/rpm/adwaita-shell.spec

%bcond check 1

# The tessela source services/ builds against (its sdk/rust); make-sources.sh
# reads this line.
%global tessela_version 0.1.0

Name:           adwaita-shell
Version:        0.1.0
Release:        2%{?dist}
Summary:        Desktop shell for Hyprland (bar, panels, launcher, drawer) built with tessela

# The project is MIT OR Apache-2.0; assets/nix-snowflake.svg (nixos-artwork)
# is CC-BY-4.0; the bundled Phosphor icon font is MIT. adwaita-services
# statically links the vendored crates; their licenses, from
# %%cargo_license_summary:
SourceLicense:  (MIT OR Apache-2.0) AND CC-BY-4.0 AND MIT
License:        (MIT OR Apache-2.0) AND CC-BY-4.0 AND MIT AND %{shrink:
                ((MIT OR Apache-2.0) AND Unicode-3.0) AND
                (Apache-2.0 AND ISC) AND
                (Apache-2.0 OR ISC OR MIT) AND
                (Apache-2.0 OR MIT) AND
                (Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT) AND
                BSD-3-Clause AND
                CDLA-Permissive-2.0 AND
                ISC AND
                (MIT OR Apache-2.0 OR LGPL-2.1-or-later) AND
                (Unlicense OR MIT)
                }
# Provisional: the project has no public home yet.
URL:            https://example.invalid/adwaita-shell
Source0:        %{name}-%{version}.tar.gz
# kit/components/Icon.tsx draws icons with the "Phosphor-Fill" font family.
Source1:        https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/Phosphor-Fill.ttf
# services/Cargo.toml takes tessela's SDK from ../../tessela/sdk/rust.
Source2:        tessela-%{tessela_version}.tar.xz
Source3:        %{name}-%{version}-vendor.tar.xz

ExclusiveArch:  %{rust_arches}

BuildRequires:  cargo-rpm-macros >= 26
BuildRequires:  rust >= 1.85
BuildRequires:  cargo
# ring (rustls' crypto) compiles C and assembly.
BuildRequires:  gcc
BuildRequires:  systemd-rpm-macros

Requires:       tessela
# The SDK is tessela's own crate, compiled into adwaita-services.
Provides:       bundled(crate(tessela-service)) = %{tessela_version}
# Commands the services run. File dependencies, so whichever package
# provides the command satisfies it.
Requires:       /usr/bin/pw-dump
Requires:       /usr/bin/wpctl
Requires:       /usr/bin/nmcli
Requires:       /usr/bin/bluetoothctl
Requires:       /usr/bin/brightnessctl
%{?systemd_requires}
# D-Bus services the services read (NetworkManager and BlueZ come with
# nmcli and bluetoothctl; logind with systemd): the power profile.
Recommends:     (power-profiles-daemon or tuned-ppd)
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
services that feed them (audio, network, bluetooth, media, notifications,
power, brightness, weather, agenda) in one Rust process.

Start it with `adwaita-shell`, or with the session:
  systemctl --user enable --now adwaita-shell.service

%prep
%autosetup -n %{name}-%{version} -a3
# The SDK where services/Cargo.toml looks for it.
tar -xf %{SOURCE2} -C ..
rm -rf ../tessela
mv ../tessela-%{tessela_version} ../tessela
cd services
%cargo_prep -v cargo-vendor

%build
cd services
%{cargo_build}
%{cargo_license_summary}
%{cargo_license} > ../LICENSE.dependencies
%cargo_vendor_manifest
# The SDK is a path dependency, listed with its build path, which the
# bundled(crate()) generator cannot parse; it has its own Provides above.
sed -i '/ (\//d' cargo-vendor.txt
mv cargo-vendor.txt ..

%install
install -Dpm0755 services/target/rpm/adwaita-services \
    %{buildroot}%{_libexecdir}/%{name}/adwaita-services

share=%{buildroot}%{_datadir}/%{name}
install -d $share
cp -a tessela.toml tsconfig.json src kit assets types $share/
# The services run from libexec, not from services/target.
sed -i 's|^command = \["services/target/release/adwaita-services"\]$|command = ["%{_libexecdir}/%{name}/adwaita-services"]|' \
    $share/tessela.toml

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
grep -q '^command = \["%{_libexecdir}/%{name}/adwaita-services"\]$' \
    %{buildroot}%{_datadir}/%{name}/tessela.toml
%if %{with check}
cd services
%{cargo_test}
%endif

%post
%systemd_user_post %{name}.service

%preun
%systemd_user_preun %{name}.service

%files
%license LICENSE-MIT LICENSE-APACHE
%license LICENSE.dependencies
%license cargo-vendor.txt
%doc README.md NEEDS.md
%{_bindir}/%{name}
%{_libexecdir}/%{name}/
%{_datadir}/%{name}/
%{_datadir}/fonts/%{name}/
%{_userunitdir}/%{name}.service

%changelog
* Wed Oct 14 2026 Fuleco <fuleco.ra.pha@gmail.com> - 0.1.0-2
- Build the Rust services (adwaita-services) instead of shipping the Python plugins

* Tue Oct 13 2026 Fuleco <fuleco.ra.pha@gmail.com> - 0.1.0-1
- First package
