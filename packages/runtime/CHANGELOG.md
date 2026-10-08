# Runtime releases

## 0.5.0 — 2026-10-08

- Render orthographic scenes with consistent framing across viewport sizes
- Change rendering effects and lighting without reloading the scene or resetting interactions
- Keep externally animated nodes rendering smoothly and return to idle when host animation stops

## 0.4.0 — 2026-10-03

- Animate individual scene nodes from host code and reset their states independently
- Receive pointer presses, releases, cancellations, and hover events without authored scene actions
- Composite transparent scenes over your page and receive asset-load failures for fallback handling
- Restyle materials and logo textures through the host API
- Use embed lifecycle controls, bounded pixel density, and frame capture

The package remains independent of keyboard generation, browser audio, and GSAP.
