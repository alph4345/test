# Models and references

Prop Forge's weapons come from the creator's own models. Claude-made weapons
are only added once there is a reference to follow.

## Legendary weapons (your models)

| Weapon | Source file(s) | Options |
|---|---|---|
| Buster Sword | thingiverse.com/thing:1794243 | Proportions; materia open / filament / resin, with optional LED sockets, wire channels and a battery bay in the hilt; dowel and steel rods. |
| Revolver Gunblade | thingiverse.com/thing:3825730 | Blade length/width; revolver cylinder rebuilt parametrically (your original chamber was not watertight): chambers, flutes, chamber holes, stop notches, turns on a pin. |
| Tanjiro's Katana | thingiverse.com/thing:4708245 | Your 7 print pieces; blade length; your tsuba or flame / mokko / aoi / square / round; silver edge line. |
| Maka's Scythe | thingiverse.com/thing:1863433 | Your topper with a printable blade drawn from your photos (tab fits the 15 mm slot, red teeth as a second filament), or your board blade + shims; eye in colour; staff; Soul's cuff buttons. |
| Zangetsu (V1) | zangetsu-V1.stl (unreleased) | Proportions, chain, dowel. File is 271 units long and shown at 1.70 m. Kept out of git (`src/templates/bundled-unreleased.js` is ignored) until you say it can be published. |

Rebuild after changing a model: put the files in a folder laid out as
described at the top of `scripts/bundle-models.mjs` and run
`npm run bundle-models -- <folder>`.

## Generators (general types)

Greatsword · Katana · Cleaver sword · Gunblade · Scythe. Each card rolls a
new one in the style of your models, and every option can be changed
afterwards.

## Waiting for a reference

Dragon Slayer · Master Sword · Kingdom Key · Leviathan Axe · Mjolnir ·
Captain America shield · Laser sword hilt · Tensa Zangetsu (Bankai) ·
Longsword · Claymore · Scimitar · Dagger · Kunai · Double battle axe ·
Bearded axe · Warhammer · Flanged mace · Morning star · Spear ·
Glaive / naginata · Viking round shield · Wizard staff

(The list the app shows lives in `src/templates/wishlist.js`.)

## How a new weapon gets added

1. Send a reference: your STL, or a side-view drawing / photo with the
   overall length, plus how it should look and come apart (blade shape,
   guard, grip, joints, filaments) and which options it should have (e.g.
   crystal shapes for a wizard staff).
2. Claude adds a kit in `src/kits/` that follows your modelling style: a
   legendary weapon for a named one, and/or a generator for a general type.
   The item leaves the waiting list.
3. Everything stays a single offline HTML file.
