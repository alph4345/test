# Cosplay prop research notes

Findings that shaped Prop Forge's defaults, with sources. Collected October 2026.

## Printer: Snapmaker U1

* 270 × 270 × 270 mm build volume, four toolheads (toolchanger), 0.4 mm nozzles
  ([Snapmaker specs](https://www.snapmaker.com/snapmaker-u1/specs), [3DJake](https://www.3djake.com/snapmaker/u1)).
* Sliced in Snapmaker Orca (an OrcaSlicer fork). Each part of an object can be given its own filament,
  by the filament list or by right-clicking the part
  ([Snapmaker wiki: multi-colour guide](https://wiki.snapmaker.com/en/snapmaker_u1/printing_guides/multi-color_printing_guide)).
  3MF projects from other slicers may need converting because of their *printer settings*
  ([U1 3MF converter guide](https://wiki.snapmaker.com/en/resource_hub/u1_3mf_converter_user_guide)),
  so Prop Forge's 3MFs carry geometry and filament slots only, no printer profile.
* The per-part filament layout of the 3MF (an object with `<components>`, and
  `Metadata/model_settings.config` with `<part id=…><metadata key="extruder" value=…/>`)
  was taken from OrcaSlicer's reader, `src/libslic3r/Format/bbs_3mf.cpp`
  ([OrcaSlicer on GitHub](https://github.com/SoftFever/OrcaSlicer)). It could not be opened in a real slicer from the build
  environment, so test-open one file before a big print.

## Convention rules (check your event)

* Emerald City Comic Con: props up to 150 cm, 180 cm for a narrow staff or spear; larger items must come apart into
  smaller pieces without tools; sharp points rounded off
  ([ECCC rules](https://www.emeraldcitycomiccon.com/en-us/about/cosplay-and-prop-rules.html)).
* New York Comic Con lists 3D printing / PLA as acceptable and warns about heavy props
  ([NYCC rules](https://newyorkcomiccon.com/en-us/about/cosplay-and-prop-rules.html)).
* Manga Comic Con requires 3D-printed props to be sanded so corners and edges are blunt; staffs up to 2 m
  ([MCC rules](https://www.manga-comic-con.de/en/visit/rules-for-cosplay)).
* Naka-Kon: nothing over 7 ft; ask first for props over 10 lb or wider than 2 ft
  ([Naka-Kon policy](https://naka-kon.com/rules/props-and-weapons-policy)).

→ Prop Forge warns over 150 cm, defaults to 2–2.4 mm edges, and offers take-apart joints.

## Joining long props

* Commercial kits run a core through the whole prop: 1" schedule-40 PVC, wooden dowel or aluminium; hollow cores
  (e.g. ¾" PVC, 21 mm ID) carry LED wiring
  ([Dangerous Ladies kits](https://dangerousladies.ca/products/trailblaze-lance-3d-print-files)).
* For take-apart props they use threaded connectors, hex nuts / coupling nuts on threaded rod, or twist-lock sleeves on
  PVC ([Lance of Longinus](https://dangerousladies.ca/products/lance-of-longinus-3d-print-files),
  [twist-lock PVC connectors](https://dangerousladies.ca/products/pvc-pipe-connectors-with-twist-locks-3d-print-files)),
  and recommend 2–3 mm walls for transport.
* Printed staffs commonly offer a threaded (travel) version and a glued peg version
  ([MakerWorld staff](https://makerworld.com/models/2210688), [Adafruit Tusken staff](https://learn.adafruit.com/tusken-chief-staff)).
* A MakerWorld sword embeds M8 lock nuts and uses printed pins against rotation
  ([MakerWorld](https://makerworld.com/models/2016808)).

→ Joints offered: shaped plug, puzzle tabs, dowel pins, key peg, **printed screw thread**, **threaded rod + heat-set
insert / coupling nut**. Staffs and polearms default to screw threads.

## Printed threads and inserts

* Printed threads: go big and coarse (M6+ at minimum; 2–4 mm pitch with rounded roots for large threads), 0.1–0.2 mm
  radial clearance as a start; most failures are along layer lines
  ([Sovol guide](https://www.sovol3d.com/blogs/news/3d-printing-threads-and-screws-how-to-design-reliable-fdm-fasteners),
  [Hackaday torque test](https://hackaday.com/tag/bolt)).
* Inserts make repeatedly assembled joints much stronger
  ([EMU thesis](https://dspace.emu.ee/items/492184a7-3068-4c74-8eaf-3ad839f846d4)).
* Heat-set insert holes (start values, test-print first): M3 4.0, M4 5.3–5.7, M5 6.4–6.5, M6 7.6–8.1, M8 10.2 mm
  ([Accu chart](https://accu-components.com/p/488-threaded-insert-hole-size-charts-for-3d-printing-pla-petg-resin),
  [Albany County Fasteners](https://www.albanycountyfasteners.com/media/64/3d/5a/1764619189/heat-set-insert-specs.pdf)).

→ Screw joint: rounded (sinusoidal) single-start thread, pitch ≈ D/5 (2.5–6 mm), 0.3 mm radial clearance, lead-in
chamfer. Insert holes use the values above.

## Shields

* Captain America shield: 24 in (610 mm) on licensed replicas; a builder's prop was 24.5 in wide and 2.5 in deep
  (~60 mm dish); ring layouts for a 26 in shield of 20 / 14–15.3 / 8–10 in diameters
  ([Marvel Legends 24"](https://www.bigbadtoystore.com/Product/VariationDetails/97083),
  [Coroflot build](https://coroflot.com/zackkohrman/Captain-America-Shield-Prop),
  [RPF thread](https://www.therpf.com/forums/threads/joshs-captain-america-shield.132398/)).
* Worn shields use a forearm strap plus a hand grip
  ([RPF strapping thread](https://www.therpf.com/forums/threads/captain-america-quick-shield-strapping.164555)).
* Viking round shields: 80–90 cm typical (70–94 cm range), a central hand grip behind the boss
  ([Vikings wiki](https://wiki.vikingsonline.org.uk/Round_shield)).

→ Star Shield: 610 mm, 60 mm dish, rings at Ø225/330/470 mm, forearm-strap loops for 38 mm webbing and a hand grip.
Round Shield: 80 cm with a hand hole behind a hollow boss and a grip bar.

## Sizes used for the pop-culture templates

| Prop | Used | Source |
|---|---|---|
| Buster Sword | 1.81 m; blade 205 × 41 mm, 60 mm bevel, 336 mm clipped tip | measured from [Budward's model](https://www.thingiverse.com/thing:1794243) (CC BY-NC-SA) |
| Revolver gunblade | 0.87 m, traced outlines | [Chemvaldes' model](https://www.thingiverse.com/thing:3825730) (CC BY-SA) |
| Master Sword | 1.24 m, guard 250 mm | [life-size model listing](https://www.cgtrader.com/3d-print-models/games-toys/toys/master-sword-from-zelda-breath-of-the-wild), [Proplica 105 cm](https://zeldauniverse.net/2024/05/31/new-proplica-master-sword-to-be-released-september-2024/) |
| Zangetsu (Shikai) | ~1.7 m ("body length") | [Instructables build](https://instructables.com/Zangetsu-Shikai-Version), Proplica Tensa Zangetsu 121 cm for comparison |
| Leviathan Axe | ~0.92 m, head ~35 cm | [licensed foam replica 94 × 35 cm](https://www.halloweencostumes.com/leviathan-axe.html) |
| Mjolnir | 44 cm; head 215 × 135 mm; handle 30 cm | [Sideshow 1:1](https://www.sideshow.com/collectibles/marvel-thor-hammer-museum-replicas-901440), retailer 1:1 listings |
| Kingdom Key | ~0.9 m | [full-size replica listings](https://www.bigbadtoystore.com/product/kingdom-hearts-kingdom-key-keyblade-exclusive-replica-172393) |

Replica sizes vary by maker; treat these as good starting points and adjust "Overall length".
