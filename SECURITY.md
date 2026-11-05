# Security policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting: open the repository's Security tab and choose "Report a vulnerability". If that is not available to you, open an issue that says you have a security concern, without exploit details, and a private channel will be arranged.

## Data model

Incident Clock runs entirely in the browser. Nothing leaves the machine: there is no server, no analytics and no network call in `src/` (a test enforces this). Profiles and incidents are kept in `localStorage` on your device, and a strict Content-Security-Policy blocks all outbound connections. Exports (JSON, calendar, print) are files you save yourself. Imported JSON is size-limited and schema-checked, and its text is only ever rendered as text.
