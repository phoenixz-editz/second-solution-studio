---
name: Validation contract changes
description: How to evolve the equation validation response without drifting generated clients.
---

Update the OpenAPI validation contract first, regenerate the API client and Zod bindings, then typecheck both the API and studio.

**Why:** The validation response is shared across the backend and renderer, so hand-editing generated bindings or changing only one side creates subtle runtime drift.

**How to apply:** Treat OpenAPI as the source of truth for new validation modes and verification metadata; run the workspace API codegen before frontend integration.