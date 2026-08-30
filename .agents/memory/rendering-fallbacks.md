---
name: Rendering fallbacks
description: WebGL is not guaranteed in the Replit preview browser; interactive visualizations need a graceful non-WebGL path.
---

Use WebGL as progressive enhancement for browser-rendered visualizations, not as the only render path.

**Why:** The Replit preview browser may reject WebGL context creation even when the code and device are otherwise healthy; an uncaught renderer constructor can blank the entire app.

**How to apply:** Feature-detect the context, catch renderer initialization, and keep a functional canvas/SVG fallback available for the graph and export controls.

For worker-backed 3D scenes, retain validated mesh geometry even when the WebGL scene cannot be created; the same data can drive a projected 2D fallback.

**Why:** Preview-only WebGL failures otherwise discard otherwise-valid worker output and leave explicit 3D modes visually empty.

**How to apply:** Keep geometry installation independent of the Three.js group, and choose the projected renderer based on renderer availability rather than worker completion alone.