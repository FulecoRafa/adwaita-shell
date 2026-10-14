#!/bin/sh
# Builds the Source files adwaita-shell.spec needs:
#   adwaita-shell-<version>.tar.gz          git archive of the tree
#   Phosphor-Fill.ttf                       the icon font the kit draws glyphs with
#   tessela-<tversion>.tar.xz               git archive of tessela (services/
#                                           builds on its SDK, sdk/rust); the
#                                           same file tessela.spec builds from
#   adwaita-shell-<version>-vendor.tar.xz   every crate in services/Cargo.lock
#                                           (cargo vendor), so rpmbuild never
#                                           touches the network
#
#   packaging/rpm/make-sources.sh [outdir]    (default: ~/rpmbuild/SOURCES)
#   REF=v0.1.0 packaging/rpm/make-sources.sh  (default: HEAD)
#   TESSELA=~/src/tessela TESSELA_REF=v0.1.0 packaging/rpm/make-sources.sh
#                                             (default: ../tessela next to this repository, HEAD)
#
# Needs git, curl, cargo and xz (e.g. `nix develop ../tessela -c packaging/rpm/make-sources.sh`).
set -eu

here=$(cd "$(dirname "$0")" && pwd)
root=$(git -C "$here" rev-parse --show-toplevel)
ref=${REF:-HEAD}
tessela=${TESSELA:-$root/../tessela}
tref=${TESSELA_REF:-HEAD}
version=$(sed -n 's/^Version:[[:space:]]*//p' "$here/adwaita-shell.spec")
tversion=$(sed -n 's/^%global tessela_version[[:space:]]*//p' "$here/adwaita-shell.spec")
font=$(sed -n 's/^Source1:[[:space:]]*//p' "$here/adwaita-shell.spec")
name=adwaita-shell-$version
tname=tessela-$tversion
out=${1:-$HOME/rpmbuild/SOURCES}
mkdir -p "$out"
out=$(cd "$out" && pwd)

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

git -C "$root" archive --format=tar.gz --prefix="$name/" -o "$out/$name.tar.gz" "$ref"
curl -fsSL -o "$out/Phosphor-Fill.ttf" "$font"
git -C "$tessela" archive --format=tar --prefix="$tname/" "$tref" > "$tmp/$tname.tar"
xz -T3 -c "$tmp/$tname.tar" > "$out/$tname.tar.xz"

# Vendor services/ with the SDK where its Cargo.toml looks for it
# (../../tessela/sdk/rust); path dependencies are not vendored.
tar -xzf "$out/$name.tar.gz" -C "$tmp"
tar -xf "$tmp/$tname.tar" -C "$tmp"
mv "$tmp/$tname" "$tmp/tessela"
(cd "$tmp/$name/services" && cargo vendor --quiet --locked --versioned-dirs cargo-vendor > /dev/null)
tar -C "$tmp/$name" --sort=name --owner=0 --group=0 --numeric-owner \
    -cf - services/cargo-vendor | xz -T3 > "$out/$name-vendor.tar.xz"

echo "$out/$name.tar.gz"
echo "$out/Phosphor-Fill.ttf"
echo "$out/$tname.tar.xz"
echo "$out/$name-vendor.tar.xz"
