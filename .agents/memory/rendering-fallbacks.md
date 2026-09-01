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

Treat explicit heightmap Surface mode as 3D in both worker scheduling and projected-fallback classification; otherwise a transparent WebGL layer can expose an empty 2D grid even when the equation is valid.

**Why:** Surface meshes follow a different evaluator branch from implicit volumes, so omitting that mode from either guard silently bypasses both the worker and the CPU projection.

**How to apply:** When adding a 3D mode, update its mode checks together across the worker, Three.js setup, CPU fallback, and canvas health checks.

Decorative landing backgrounds should use CSS gradients and compositor-friendly transforms; reserve requestAnimationFrame loops for interactive plots and pause scene canvases when their container is off-screen.

**Why:** A decorative animation can consume a full render loop without adding interaction, especially on mobile, while off-screen WebGL work continues unless visibility is handled explicitly.

**How to apply:** Prefer a CSS-only ambient layer for page atmosphere and let IntersectionObserver mount or unmount expensive WebGL scene resources while leaving the CPU fallback available.