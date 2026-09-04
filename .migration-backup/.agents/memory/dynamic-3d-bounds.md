---
name: Dynamic 3D bounds
description: Why sampled mathematical extents must be shared across all 3D rendering paths
---

Treat sampled dynamic world bounds as a single rendering contract: the calculated extent must consistently drive the camera distance, far plane, orbit limits, ray-box uniforms, shader domain scale, and CPU fallback geometry.

**Why:** Fixed or viewport-dependent limits can clip valid mathematical surfaces and make the WebGL and fallback renderers disagree, while independently scaled paths produce apparent boundary distortion.

**How to apply:** When changing implicit, surface, or parametric 3D rendering, update the shared extent calculation and verify both WebGL uniforms and CPU fallback geometry use the same world-space scale.