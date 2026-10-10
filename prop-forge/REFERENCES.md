# Models and references

Prop Forge's templates are the creator's own models. Claude-made weapon
templates were removed until there is a reference to follow.

## In the app (your models)

| Template | Source file(s) | Notes |
|---|---|---|
| Buster Sword | thingiverse.com/thing:1794243 | 1:1 (file in cm). Filament zones: hilt, grip. |
| Revolver Gunblade | thingiverse.com/thing:3825730 | Parts assembled; grip halves fused and seated 4 mm into the frame; chamber and pin rebuilt as cylinders (originals not watertight). |
| Tanjiro's Katana | thingiverse.com/thing:4708245 | Your 7 print pieces as-is; the tsuba stays its own piece. |
| Maka's Scythe topper + Soul's buttons | thingiverse.com/thing:1863433 | Topper (17 mm rod), blade shims, cuff button + pin. Eye whites as a filament zone. |
| Zangetsu (V1) | zangetsu-V1.stl (unreleased) | File is 271 units long; template scales it to 1.70 m. Kept out of git (`src/templates/bundled-unreleased.js` is ignored) until you say it can be published. |

Rebuild after changing a model: put the files in a folder laid out as
described at the top of `scripts/bundle-models.mjs` and run
`npm run bundle-models -- <folder>`.

## Waiting for a reference

Dragon Slayer · Master Sword · Kingdom Key · Leviathan Axe · Mjolnir ·
Captain America shield · Laser sword hilt · Tensa Zangetsu (Bankai) ·
Maka's scythe blade (printable) · Longsword · Claymore · Katana (generic) ·
Scimitar · Dagger · Kunai · Double battle axe · Bearded axe · Warhammer ·
Flanged mace · Morning star · Spear · Glaive / naginata · Reaper scythe ·
Viking round shield · Wizard staff

(The list the app shows lives in `src/templates/wishlist.js`.)

## How a new weapon gets added

1. Send a reference: your STL, or a side-view drawing / photo with the
   overall length, plus how it should look and come apart (blade shape,
   guard, grip, joints, filaments).
2. Claude builds a template in code that follows your modelling style
   (proportions, thicknesses, how you split and join pieces) and adds it to
   `src/templates/mymodels.js`; the item leaves the waiting list.
3. Everything stays a single offline HTML file.
