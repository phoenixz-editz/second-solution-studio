---
name: Optional headless validation
description: The validation service's browser verifier is an opt-in enhancement layered over local AST parsing.
---

Use local mathjs AST validation as the authoritative baseline. A headless browser check may run only when explicitly enabled and should degrade to the AST result if Playwright, Chromium, or a reference renderer is unavailable.

**Why:** Validation must remain safe, deterministic, and available in lightweight Replit environments where browser binaries may not be installed.

**How to apply:** Keep browser imports optional, never evaluate user expressions through shell or JavaScript execution, and preserve the same API response when the optional check cannot run.