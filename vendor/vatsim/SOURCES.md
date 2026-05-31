# VATSIM Boundary Source Inputs

## simaware-tracon
- Source repository: https://github.com/vatsimnetwork/simaware-tracon-project
- Pinned commit SHA: `bf61147a0fd5ced31d53e218e43ca54c616ea932`
- Files consumed:
  - `simaware-tracon/Boundaries/**/*.json`
  - `simaware-tracon/README.md`
- Purpose: source metadata and geometry for APP/DEP/TRACON-style terminal boundaries.
- License / attribution notes:
  - No explicit `LICENSE` file is present in the vendored source snapshot.
  - Attribution is retained via vendored `README.md` and source repository reference above.
  - Maintainer review recommended before redistribution outside this project.
- Date vendored: 2026-05-27

## vatspy
- Source repository: https://github.com/vatsimnetwork/vatspy-data-project
- Pinned commit SHA: `11a30f7ad73fd802d1c10491685634dc4ad9185f`
- Files consumed:
  - `vatspy/Boundaries.geojson`
  - `vatspy/LICENSE`
  - `vatspy/README.md`
- Purpose: source metadata and geometry for FIR/CTR-style center boundaries.
- License / attribution notes:
  - Source includes `LICENSE` with Creative Commons BY-SA 4.0 terms.
- Date vendored: 2026-05-27

## vatglasses
- Source repository: https://github.com/lennycolton/vatglasses-data
- Pinned commit SHA: `63cbb775c49ab2497541d26dcb2f2ff9cff0cfcb`
- Files consumed:
  - `vatglasses/data/**/*.json`
  - `vatglasses/LICENSE`
  - `vatglasses/README.md`
- Purpose: optional advanced sectorization data for CTR/FSS-style regional fallback coverage.
- License / attribution notes:
  - Source includes Creative Commons BY-NC-SA 4.0 terms; non-commercial restriction applies.
- Date vendored: 2026-05-27

## Refresh workflow
1. Pull updated snapshots from each upstream repository at reviewed pinned commits.
2. Replace files under `vendor/vatsim/*` with updated snapshots.
3. Run `npm run build:vatsim-boundaries` to regenerate static app data.
4. Review `src/data/vatsim/generated/VATSIM-BOUNDARY-AUDIT.md` before shipping.
