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

1. **Pick**:
   * **Legendary weapons** are named weapons made from your own models
     (Buster Sword, Revolver Gunblade, Zangetsu V1, Tanjiro's katana, Maka's
     scythe; see [REFERENCES.md](REFERENCES.md)).
   * **Generate a weapon** rolls a new weapon of a general type (greatsword,
     katana, cleaver sword, scythe). Greatswords come with a choice of
     blade shape, point, fuller, guard (cross, swept, winged, block, disc),
     grip, pommel and parrying hooks; scythes have their own blade shapes
     (reaper, hooked, broad, crescent) on a staff that comes apart.
   * You can also open any STL as a new project or start blank. The panel
     lists the weapons still waiting for a reference.
2. **Customize**: options made for that weapon, with picture choices,
   sliders and colour slots. Examples: the Buster's materia (open, filament
   or resin-printed; with LEDs the domes print hollow and come off on
   magnets, and the blade gets LED sockets, wire channels and a battery bay
   with a magnetic lid and a switch hole), the gunblade's revolver cylinder
   (chambers, flute style and length, chamber holes, turns on a pin),
   Tanjiro's tsuba shapes and diameter and a silver edge line, Zangetsu's
   heel (pointed, or cut off as in the V1 file), and Maka's printable blade
   with red teeth on a printed or bought staff. Cloth handle wraps are left
   off the print (wrap them for real). Generated weapons have a
   *Generate another* button (and a 🎲 per option group). Proportions of
   your meshes (blade length, width, grip length) stretch the model without
   breaking it.
   *Edit parts by hand (advanced)* opens the parts editor. Click any part to
   edit it. Blades and flat shapes have a vector-style outline editor: drag
   nodes, click the green **+** on any segment to insert a node, right-click
   (or Delete) to remove one, make a node a *Curve* and drag its handles,
   and mark nodes *Sharp* to grind that edge. Long outlines can be shown
   sideways, and you can load a reference picture and trace it.
   Blade grind controls: where the grind starts, edge thickness, flat /
   convex / hollow grind, both faces or one (chisel), and distal taper toward
   the tip, with a to-scale cross-section preview. New parts appear beside
   the model and join it where they touch; holes cut away; a colour zone
   (purple box when selected) prints what's inside it in another filament.
   **STL import** lays the model flat (length along Y), closes small holes,
   and simplifies very dense meshes (a 627k-triangle Blender export comes in
   as ~26k with no visible change) so you can split them and add joints and
   inserts too. Meshes that aren't watertight still show and export as-is.
3. **Inserts**: handle dowel / steel rod channels (real dowel sizes such as
   3/8" and 1/2"), electronics and 18650 battery bays with a removable lid
   (the lid is printed as its own piece and keeps the surface shape, with
   optional magnet pockets and a switch hole), wire channels and LED strip
   grooves (11 mm wide for 10 mm strip, with a clip-on cover you print in
   translucent filament), and
   **hardware**: hand grips and strap loops that reach down to a curved
   shield back.
4. **Split**: choose your printer and press *Auto-split*. Pieces that print
   on their own (Maka's blade, a printed staff) get cuts of their own. Long parts are
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
5. **Export**: ZIP of STLs and 3MFs laid out for the bed, a README with the
   joint list, a shopping list (dowel lengths, pins, magnets, LEDs,
   resistors, batteries) and assembly steps for the lights.
   Resin pieces (e.g. materia) go in a separate `resin/` folder and stay out
   of the filament 3MF projects.

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

### Weapon kits

Each weapon lives in `src/kits/`. Legendary kits (the creator's mesh plus
options of its own) are in `buster.js`, `gunblade.js`, `zangetsu.js`,
`katana.js` and `scythe.js` (Maka). Generator kits (parametric weapons of a
general type) are `greatsword.js`, `reaper.js` (scythe), and the second
exports of `zangetsu.js` (cleaver) and `katana.js`. A kit variant lists option groups (`choice`
with optional outline icons, `range`, `toggle`, `fil` for filament slots;
see `src/kits/core.js`) and a `build(opts)` that returns a design. Parts it
builds are rebuilt whenever an option changes. Parts and inserts that are
added by hand, the cuts, the name and the filament colours are kept.

Parts are built with the helpers in `src/templates/helpers.js` and
`src/kits/parts.js`: `blade()` (outline with sharp/bevelled points),
`flat()`, `lathe()`, `box()`, `cyl()`, `sphere()`, `hole()`, `ring()`,
`pillow()` (rounded slab), `revolver()` (fluted cylinder), `meshPart()` (a
bundled model, optionally with a proportion `warp`), `zone()` (colour zone),
plus `dowel()`/`bay()` inserts. Flags: `separate` prints a part as its own
piece (a shared name groups several parts into one piece), `resin` exports
it for a resin printer, `reference` shows a part see-through without
printing it (a bought rod, for instance), and `target` aims a hole at one
part. Units are mm.
Y runs up the weapon. `npm test` builds every kit, and many random rolls of
each generator, and checks that nothing comes apart.

The bundled meshes are the creator's own models, regenerated with
`npm run bundle-models -- <folder>` into `src/templates/bundled-models.js`
(published models) and `src/templates/bundled-unreleased.js` (git-ignored).
