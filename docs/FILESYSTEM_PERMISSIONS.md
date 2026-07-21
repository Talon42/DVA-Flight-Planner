# Filesystem permissions

The frontend retains only `fs:allow-read-text-file`. It is required to read the XML or JSON file path returned by the native file picker for user-initiated schedule imports.

Fixed app-owned files no longer use frontend filesystem permissions. Saved schedules, UI state, onboarding state, tour cache/progress, SimBrief settings, dev-tools state, What's New state, and the app log are accessed through key-restricted Rust commands. Those commands do not accept arbitrary paths.

Recursive AppData and AppLocalData read/write permissions are intentionally not granted.
