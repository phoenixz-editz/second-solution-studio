---
name: Implicit surface fallback
description: Reliable rendering behavior for bare function expressions entered in 3D implicit mode.
---

Bare expressions in 3D implicit mode should be treated as the zero surface `f(x,y) - z = 0`. When that field is effectively a height surface across the volume, the equivalent heightmap mesh is more reliable than extracting a nearly planar volume crossing.

**Why:** A valid function-only field can produce an empty marching-volume result even though its zero surface is well-defined, especially when most of the sampled volume is close to zero or the surface spans the viewport.

**How to apply:** Keep the normalized implicit field for evaluation and validation, detect function-only 3D inputs without `z` or an equality, and route both worker and CPU fallback geometry through normalized heightmap scaling.