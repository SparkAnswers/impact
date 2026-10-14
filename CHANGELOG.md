# Changelog

## 1.0.1 (2026-10-14)

Flow Designer

- Focus: a node click (Links > Node click = Focus) or "Focus on chain" in the right-click menu shows only the node and its chain; Interaction > Focus limits hops and direction; a chip with a Back button and Esc lead back
- Prune: Data > Prune rules (hide leaves, min value, max depth, collapse groups), a hidden list with a right-click "Hide node / Hide group" menu and a `hidden N` chip
- Layout: tall layers fold automatically (Wrap layers after 0 = automatic); Data > Spread sets how far layers stretch towards the panel shape
- Zoom: one wheel notch is one +/- step on every browser, the floor is 5 %, double-click a node or group label to zoom onto it, a Back chip while zoomed, and a large panel resize re-fits
- Particles: Animation > Particles (Animated / Static / Hidden), Animation off hides them instead of freezing them, Particle limit (default 400) and a separate particle layer keep big graphs smooth

Flow River

- Network map: a node click focuses on its chain with the same Back chip; Spread layers (default on) spaces short layers across the panel; Curve accepts negative values
- One particle layer per trail value

## 1.0.0 (2026-10-07)

Initial release with four panels bundled in one app plugin:

- **Flow Designer** - node and edge diagrams with glowing edges, travelling particles, editable curves and data-bound edges
- **Power Gauge** - ring gauge with signed arc fill, live marker and an in-ring history chart
- **Flow River** - particle streamlines along one or more channels coloured by value
- **Status Bars** - table rows with animated progress bars, sparklines, stacked bars and status pills
