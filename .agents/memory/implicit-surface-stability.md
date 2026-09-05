---
name: Implicit surface stability
description: Numerical safeguards needed to keep implicit-surface renderers from producing false boundary geometry.
---

Treat clamped or saturated scalar-field samples as unusable for zero-crossing detection, and avoid emitting cells directly on the outer sampling boundary.

**Why:** Overflowed expressions can make a ray or grid cell appear to cross zero at the domain edge, which renders a false cube or produces unstable normals instead of a clipped surface.

**How to apply:** Keep scalar limits finite, reject saturated samples during bracketing, normalize gradients only after finite checks, and leave a small interior margin around the AABB.