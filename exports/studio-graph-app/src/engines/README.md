# Rendering engines

The active 2D canvas renderer and Three.js/WebGL 3D renderer are implemented in the complete `src/App.tsx` source. The inline shader programs, indexed implicit-surface mesh installation, smooth normals, adaptive LOD, and projected fallback are kept together so they share the same scene state and animation clock.

This directory is reserved for future extraction of those engines into independent modules without changing the packaged source layout.