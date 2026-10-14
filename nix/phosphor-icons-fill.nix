# Phosphor icons (fill) as a font: kit/components/Icon.tsx draws glyphs with
# the "Phosphor-Fill" family (codepoints in kit/lib/glyphs.ts).
{ fetchurl, stdenvNoCC, lib }:

stdenvNoCC.mkDerivation {
  pname = "phosphor-icons-fill";
  version = "2.1.1";

  src = fetchurl {
    url = "https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/Phosphor-Fill.ttf";
    hash = "sha256-pT9dJjDKteO3U27LnWnXFRmiGQKYwisfjXcN03vClAo=";
  };

  dontUnpack = true;

  installPhase = ''
    install -Dm444 $src $out/share/fonts/truetype/Phosphor-Fill.ttf
  '';

  meta = {
    description = "Phosphor icons, fill weight, as a TrueType font";
    homepage = "https://phosphoricons.com";
    license = lib.licenses.mit;
    platforms = lib.platforms.all;
  };
}
