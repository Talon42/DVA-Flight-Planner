---
eyebrow: Release Notes
title: v0.8.2-beta
imageAlt: 
layout: text
---
## Schedule Data

- Hardened schedule parsing to avoid stale schedule dates due to malformed schedule data.
    - For example, a 9/1/2026 schedule that includes flights specifically scheduled for 8/1/2014 will no longer force the schedule to show a stale date of "2020".
- Schedule times are now in local time rather than UTC to match the imported schedule data.
- Equipment filters now use precise types. Meaning, if you select a B747 in the filter you will ONLY see flights flown by the B747 per schedule data.

## Functionality

- Users will no longer be prevented from adding flights to the flight board from a stale schedule. Instead, flights will be added but users will receive a warning popup.
- Minor bug fixes and optimizations
