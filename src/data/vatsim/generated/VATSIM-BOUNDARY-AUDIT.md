# VATSIM Boundary Audit

Generated at: 2026-05-31T01:40:50.712Z

## Source summary
- SimAware TRACON files scanned: 1243
- VATSpy files scanned: 1
- VATGlasses files scanned: 0

## Default display source authority
- APP/DEP regional display resolves against SimAware terminal boundaries.
- CTR/FSS regional display resolves against VATSpy center boundaries.
- VATGlasses sector data is skipped unless --include-sectors is provided.

## Feature counts by source
- simaware-tracon: 1243
- vatspy: 1038
- vatglasses: 0

## Feature counts by kind
- terminal: 1243
- center: 1038
- sector: 0

## Match counts by kind
- terminal: 1420
- center: 3400
- sector: 0

## Center Facility Alias Summary
- Facilities loaded: 32
- Facilities resolved to VATSpy boundaries: 27
- Facilities missing VATSpy boundaries: 5
- Alias match records generated: 132

### Resolved center/ACC aliases
- ZAB -> KZAB / KZAB
- ABQ -> KZAB / KZAB
- ZAU -> KZAU / KZAU
- CHI -> KZAU / KZAU
- ZBW -> KZBW / KZBW
- BOS -> KZBW / KZBW
- ZDC -> KZDC / KZDC
- DC -> KZDC / KZDC
- WASH -> KZDC / KZDC
- ZDV -> KZDV / KZDV
- DEN -> KZDV / KZDV
- ZFW -> KZFW / KZFW
- FTW -> KZFW / KZFW
- ZHU -> KZHU / KZHU
- HOU -> KZHU / KZHU
- ZID -> KZID / KZID
- IND -> KZID / KZID
- ZJX -> KZJX / KZJX
- JAX -> KZJX / KZJX
- ZKC -> KZKC / KZKC
- KC -> KZKC / KZKC
- ZLA -> KZLA / KZLA
- LA -> KZLA / KZLA
- LAX -> KZLA / KZLA
- ZLC -> KZLC / KZLC
- SLC -> KZLC / KZLC
- ZMA -> KZMA / KZMA
- MIA -> KZMA / KZMA
- ZME -> KZME / KZME
- MEM -> KZME / KZME
- ZMP -> KZMP / KZMP
- MSP -> KZMP / KZMP
- MIN -> KZMP / KZMP
- ZNY -> KZNY / KZNY
- NY -> KZNY / KZNY
- NYC -> KZNY / KZNY
- ZOA -> KZOA / KZOA
- OAK -> KZOA / KZOA
- ZOB -> KZOB / KZOB
- CLE -> KZOB / KZOB
- ZSE -> KZSE / KZSE
- SEA -> KZSE / KZSE
- ZTL -> KZTL / KZTL
- ATL -> KZTL / KZTL
- CZVR -> CZVR / CZVR
- VAN -> CZVR / CZVR
- YVR -> CZVR / CZVR
- CZEG -> CZEG / CZEG
- EDM -> CZEG / CZEG
- YEG -> CZEG / CZEG
- CZWG -> CZWG / CZWG
- WIN -> CZWG / CZWG
- WPG -> CZWG / CZWG
- YWG -> CZWG / CZWG
- CZYZ -> CZYZ / CZYZ
- TOR -> CZYZ / CZYZ
- YYZ -> CZYZ / CZYZ
- CZUL -> CZUL / CZUL
- MTL -> CZUL / CZUL
- YUL -> CZUL / CZUL
- CZQM -> CZQM / CZQM
- MON -> CZQM / CZQM
- YQM -> CZQM / CZQM
- CZQX -> CZQX / CZQX
- GANDER -> CZQX / CZQX
- YQX -> CZQX / CZQX

### Unresolved center/ACC facilities
- HCF / Honolulu Control Facility
- JCF / Joshua Control Facility
- ZAN / Anchorage Center
- ZSU / San Juan Center
- ZUA / Guam Center

## Duplicate prefix/suffix pairs
- terminal LEZL|APP -> LECS-APT, LEZL

## Features with missing match metadata
- none

## Features with invalid geometry
- none

## VATGlasses coordinate conversion warnings
- none

## Known unresolved gaps
- Duplicate match pairs remain and are left unresolved for manual review.
- No skipped features due to missing match metadata.

## Recommended next manual review items
- Review duplicate match pairs and decide source-priority overrides where needed.
- Review VATGlasses coordinate warnings for potential parser improvements.
- Spot-check high-traffic APP/DEP and CTR callsigns against map output.

## Generator warnings
- none
