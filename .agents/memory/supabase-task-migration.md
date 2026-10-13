---
name: Local task migration
description: Why the app imports legacy local tasks once per device rather than once per signed-in user.
---

Import the legacy on-device task list only once per device, on the first successful Supabase sign-in.

**Why:** The old local list has no account owner. A per-user migration marker would copy the same device's private tasks into every account that signs into that device.

**How to apply:** Keep the migration marker device-global, and set it only after Supabase accepts the migration. Do not clear the old list before that succeeds.
