---
name: Vercel import porting
description: Durable notes for moving imported Vercel projects into the workspace artifact layout.
---

Imported Vercel projects may already contain a partially converted artifact inside `.migration-backup`, while the active workspace only has the scaffold. The frontend copy helper may need an explicit nested client directory instead of auto-detection.

**Why:** The migration detector only recognizes conventional root/client layouts, but imported exports can place the actual app under `artifacts/<slug>`.

**How to apply:** Inspect the backup tree first; use the copy helper with the exact nested client directory, then regenerate shared API clients from the imported OpenAPI contract before checking artifact type errors.