---
name: Implicit layer bindings
description: Multi-layer 3D implicit equations can define reusable variables in separate inputs.
---

In 3D implicit mode, a visible layer containing a simple custom assignment such as `h = sin(z)` is a variable binding, not an additional volumetric surface. Resolve these bindings recursively into every render field before generating GLSL.

**Why:** Treating helper layers as geometry creates particle-like fallback artifacts, while unresolved symbols make the primary distance function fail compilation.

**How to apply:** Preserve coordinate/time aliases as built-ins, collect custom assignments from all visible layers (including leading assignments in one input), omit binding-only layers from field lists, and reject cycles or unresolved symbols during shader compilation.