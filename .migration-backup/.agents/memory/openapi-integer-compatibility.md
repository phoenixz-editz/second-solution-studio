---
name: OpenAPI integer compatibility
description: Orval and the workspace Zod version need compatible numeric schema generation.
---

When adding numeric IDs to OpenAPI contracts, prefer `type: number` with `format: int32` rather than `type: integer` so Orval generates a Zod 3-compatible numeric validator.

**Why:** The current Orval output uses `zod.int()` for OpenAPI integer schemas, while the workspace resolves Zod 3.25, which does not expose that top-level helper.

**How to apply:** Regenerate bindings after contract changes and run the library typecheck before using the generated schemas in server routes.