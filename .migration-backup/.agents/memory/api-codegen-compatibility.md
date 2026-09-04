---
name: API codegen compatibility
description: OpenAPI formats must match the workspace's generated Zod version.
---

OpenAPI schemas should avoid generator helpers that are unavailable in the workspace's Zod 3 output; use explicit string constraints when needed.

**Why:** A valid OpenAPI format can still make Orval emit a runtime helper that the pinned Zod version does not expose, breaking the library typecheck after codegen.

**How to apply:** After every OpenAPI change, run codegen and the library typecheck before wiring the generated client into an artifact.