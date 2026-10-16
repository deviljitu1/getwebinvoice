# Disabled database integration

This folder is an archive only; neither app entry point loads Firebase, saves invoices, loads history, or allocates invoice numbers. Enter invoice numbers manually.

`integration.html.disabled` preserves the connection, history UI, and save routine for future implementation. `firebase.json` and `firestore.rules` are the original deployment configuration. The old bundled SDK remains unreferenced in `dist/assets`.

Before restoring, add authentication and restricted access rules, fix the counter to parse the sequence rather than the year plus sequence, and prevent duplicate invoice IDs from overwriting records. The archived rules allow unrestricted access. Disabling this client does not change any already-deployed database rules.
