# Prop Forge

A browser app for designing 3D-printable prop weapons without Blender.
Pick a template, reshape it, add dowel channels and electronics bays, then
let it cut the prop into pieces that fit your printer, with interlocking
joints. Exports print-ready STL files.

**To use it:** download [`prop-forge.html`](prop-forge.html) and double-click
it. It runs offline in Chrome, Edge or Firefox. Your work autosaves in the browser.

Research behind the defaults (convention rules, joints, threads, shields, the
Snapmaker U1 and template sizes) is in [RESEARCH.md](RESEARCH.md).

## Workflow

1. **Forge**: pick a template (27 so far: Buster Sword, Zangetsu, Dragon
   Slayer, Master Sword, Kingdom Key, Revolver Gunblade, Leviathan Axe,
   Mjolnir, Star Shield, Laser Sword Hilt, Reaper Scythe, plus longsword,
   claymore, katana, scimitar, dagger, kunai, axes, warhammer, maces, spear,
   glaive, round shield, wizard staff and a blank starter sword).
2. **Shape**: set the overall length, click any part to edit it. Blades
   and flat shapes have a vector-style outline editor: drag nodes, click the
   green **+** on any segment to insert a node, right-click (or Delete) to
   remove one, make a node a *Curve* and drag its handles, and mark nodes
   *Sharp* to grind that edge. Long outlines can be shown sideways, and you
   can load a reference picture and trace it.
   Blade grind controls: where the grind starts, edge thickness, flat /
   convex / hollow grind, both faces or one (chisel), and distal taper toward
   the tip, with a to-scale cross-section preview.
   Parts can be added, cut away (holes), mirrored or arrayed radially, and
   given a filament slot. **Import STL** brings in models from Thingiverse,
   Printables etc. (small holes are closed automatically) so you can split
   them and add joints and inserts too.
3. **Inserts**: handle dowel / steel rod channels (real dowel sizes such as
   3/8" and 1/2"), electronics and 18650 battery bays with a removable lid
   (the lid is printed as its own piece and keeps the surface shape, with
   optional magnet pockets), wire channels and LED strip grooves, and
   **hardware**: hand grips and strap loops that reach down to a curved
   shield back.
4. **Split**: choose your printer and press *Auto-split*. Long parts are
   sliced across; parts too wide for the bed (big blades, guards, shields)
   are also split lengthwise, with the seams of the two halves staggered.
   Pieces are oriented to print flat or on edge, never standing on end.
   Each cut gets a joint you can change:
   * **Shaped plug (tenon)**: a plug shaped like the cross-section slides
     into a matching socket. Strong and self-aligning.
   * **Puzzle tabs**: jigsaw dovetails through the thickness, for flat blades.
   * **Dowel pins**: matching holes for wooden dowels, rod or printed pins.
   * **Key peg**: square, cross or round peg (square and cross stop twisting).
   * **Screw thread**: printed thread, the pieces screw apart with no tools
     (staffs and polearms use this by default).
   * **Threaded rod + insert**: steel rod glued in one piece, heat-set insert or
     coupling nut in the other; strongest take-apart joint.
   Clearances are adjustable. *Clamshell handle* splits just the grip
   front/back so you can fit electronics.
5. **Export**: ZIP of STLs laid out for the bed, a README with the joint
   list, and a shopping list (dowel lengths, pins, magnets).

## Development

```
npm install
npm run dev      # live dev server
npm test         # engine + template tests (Node)
npm run build    # writes dist/index.html (single self-contained file)
cp dist/index.html prop-forge.html
```

Geometry uses [manifold-3d](https://github.com/elalish/manifold) (WASM,
always watertight output) in a Web Worker, with a same-thread fallback when
the page is opened from disk. UI is Preact + Three.js.

### Adding a template

Templates live in `src/templates/` (`popculture.js`, `classic.js`). The Buster Sword and Revolver gunblade proportions come from the Thingiverse models credited in `popculture.js`. Each
one is a function returning parts built with the helpers in `helpers.js`:
`blade()` (outline with sharp/bevelled points), `flat()`, `lathe()`
(revolved profile for grips and pommels), `box()`, `cyl()`, `sphere()`,
`hole()`, `ring()`, plus `dowel()`/`bay()` inserts. Units are mm; Y runs
up the weapon with the blade starting at y = 0. Add it to the default export
list and `npm test` checks that it builds as one solid and splits to fit.
