#!/bin/sh
# Builds the Source files adwaita-shell.spec needs:
#   adwaita-shell-<version>.tar.gz   git archive of the tree
#   Phosphor-Fill.ttf                the icon font the kit draws glyphs with
#
#   packaging/rpm/make-sources.sh [outdir]    (default: ~/rpmbuild/SOURCES)
#   REF=v0.1.0 packaging/rpm/make-sources.sh  (default: HEAD)
#
# Needs git and curl (or run `spectool -g` on the spec for the font).
set -eu

here=$(cd "$(dirname "$0")" && pwd)
root=$(git -C "$here" rev-parse --show-toplevel)
ref=${REF:-HEAD}
version=$(sed -n 's/^Version:[[:space:]]*//p' "$here/adwaita-shell.spec")
font=$(sed -n 's/^Source1:[[:space:]]*//p' "$here/adwaita-shell.spec")
out=${1:-$HOME/rpmbuild/SOURCES}
mkdir -p "$out"

git -C "$root" archive --format=tar.gz --prefix="adwaita-shell-$version/" \
    -o "$out/adwaita-shell-$version.tar.gz" "$ref"
curl -fsSL -o "$out/Phosphor-Fill.ttf" "$font"

echo "$out/adwaita-shell-$version.tar.gz"
echo "$out/Phosphor-Fill.ttf"
