{
  description = "Development tools for pi-pack";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/9f11f828c213641c2369a9f1fa31fe31557e3156";

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      nativeSources = {
        x86_64-linux = {
          url = "https://registry.npmjs.org/jscpd-linux-x64-musl/-/jscpd-linux-x64-musl-5.3.3.tgz";
          hash = "sha512-J4lN8yc6VieD1Hh/TvtOcRm7bZ3D20idaoy6VZb0iWEa9Ui5M5vJa+hOLK1ye6i6Lyn8CkkSBFCqS9jqsTiF9A==";
        };
        aarch64-linux = {
          url = "https://registry.npmjs.org/jscpd-linux-arm64-musl/-/jscpd-linux-arm64-musl-5.3.3.tgz";
          hash = "sha512-pPSPdzRZD3NNHi/5y3ud9z2E3SjIAYh7VWyGrIs0DVzwI7n/0paRFkQ0W6VCdWfPCK6Tnb1yeMgX/vOrygV0sg==";
        };
        x86_64-darwin = {
          url = "https://registry.npmjs.org/jscpd-darwin-x64/-/jscpd-darwin-x64-5.3.3.tgz";
          hash = "sha512-MnVxRZX0IWDHP+ze6cMNTQuRsyBy/UB58fgZm/+R8fyktYVScOtYEQw+6AOz2ng6EjzYaCxGJwzlni94yfEZkA==";
        };
        aarch64-darwin = {
          url = "https://registry.npmjs.org/jscpd-darwin-arm64/-/jscpd-darwin-arm64-5.3.3.tgz";
          hash = "sha512-fjjfjNf5p9jhEwFvgRyOteGPV7TYwPZ/bFhPiITs2KgvirDMOv7d5lgVSmS3BUHSBMyNwzxjyrAvvvSsE2LdXA==";
        };
      };
      jscpdPackages = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        pkgs.stdenvNoCC.mkDerivation {
          pname = "jscpd";
          version = "5.3.3";
          src = pkgs.fetchurl nativeSources.${system};
          dontConfigure = true;
          dontBuild = true;
          dontPatchELF = true;
          dontStrip = true;

          installPhase = ''
            runHook preInstall
            install -Dm755 bin/jscpd "$out/bin/jscpd"
            runHook postInstall
          '';

          meta = {
            description = "Copy/paste detector";
            homepage = "https://jscpd.dev";
            license = pkgs.lib.licenses.mit;
            mainProgram = "jscpd";
            platforms = systems;
          };
        });
    in
    {
      packages = forAllSystems (system: {
        jscpd = jscpdPackages.${system};
        default = jscpdPackages.${system};
      });

      devShells = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          jscpdPackage = jscpdPackages.${system};
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_24
              pkgs.git
              jscpdPackage
            ];
            JSCPD_BIN = "${jscpdPackage}/bin/jscpd";
          };
        });
    };
}
