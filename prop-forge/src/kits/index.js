// Weapon kits: the creator's own models with options that fit each weapon,
// plus generated weapons of the same type.
import { hasModel } from '../templates/models.js';
import { defaultsOf, rng, newSeed, randomOpts } from './core.js';
import { buster, greatsword } from './buster.js';
import { gunblade, gunbladeGen } from './gunblade.js';
import { zangetsu, cleaver } from './zangetsu.js';
import { katana, katanaGen } from './katana.js';
import { scythe, scytheGen } from './scythe.js';

const modelReady = (kit) => kit.models.every(hasModel);

// Legendary weapons: named weapons made from the creator's own models, each
// with options of its own (listed only when the model is bundled, so an
// unreleased one stays private).
export const LEGENDARY = [buster, gunblade, zangetsu, katana, scythe].filter(modelReady);

// Generators: general weapon types that can be rolled at random, drawn in
// the style of the creator's models.
export const GENERATORS = [greatsword, katanaGen, cleaver, gunbladeGen, scytheGen];

export const KITS = [...LEGENDARY, ...GENERATORS];

export const kitById = (id) => KITS.find((k) => k.id === id) || null;

export const variantsOf = (kit) => Object.keys(kit.variants);

export const defaultVariant = (kit) => variantsOf(kit)[0];

export const groupsOf = (kit, variant) => kit.variants[variant].groups();

export function recipeFor(kit, variant = defaultVariant(kit), { random = false, seed = null, base = null } = {}) {
  const v = kit.variants[variant];
  const groups = v.groups();
  let opts = { ...defaultsOf(groups), ...(base || {}) };
  let s = seed;
  if (random) {
    s = s ?? newSeed();
    opts = randomOpts(groups, rng(s), opts);
    if (v.tidy) opts = v.tidy(opts, rng(s ^ 0x5bd1e995));
  }
  return { kit: kit.id, variant, opts, seed: s };
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'part';
const KEEP_FEATURE = ['diameter', 'clearance', 'hidden', 'filament', 'lid'];

// Design for a recipe. With `prev` (the design being edited) everything the
// person did by hand is kept: their own parts and inserts, changes to the
// kit's inserts, the cuts, the name and the filament colours.
export function designFromRecipe(recipe, prev = null) {
  const kit = kitById(recipe.kit);
  if (!kit || !kit.variants[recipe.variant]) return null;
  const v = kit.variants[recipe.variant];
  const opts = { ...defaultsOf(v.groups()), ...recipe.opts };
  const d = v.build(opts);
  // stable ids, so selections and targets survive a rebuild
  const remap = new Map();
  const seen = new Map();
  for (const p of d.parts) {
    const base = `k-${slug(p.name)}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const id = n > 1 ? `${base}-${n}` : base;
    remap.set(p.id, id);
    p.id = id;
    p.gen = 1;
  }
  for (const p of d.parts) if (p.target && remap.has(p.target)) p.target = remap.get(p.target);
  for (const f of d.features) { if (!String(f.id).startsWith('k-')) f.id = `k-${slug(f.name)}`; f.gen = 1; }
  const dropped = new Set(recipe.dropped || prev?.recipe?.dropped || []);
  d.parts = d.parts.filter((p) => !dropped.has(p.id));
  d.features = d.features.filter((f) => !dropped.has(f.id));
  const baseScale = d.scale || 1;
  if (prev) {
    const old = new Map((prev.features || []).map((f) => [f.id, f]));
    d.features = d.features.map((f) => {
      const q = old.get(f.id);
      if (!q || !q.gen) return f;
      const keep = {};
      for (const k of KEEP_FEATURE) if (q[k] !== undefined) keep[k] = q[k];
      return { ...f, ...keep };
    });
    d.parts = d.parts.concat((prev.parts || []).filter((p) => !p.gen));
    d.features = d.features.concat((prev.features || []).filter((f) => !f.gen));
    d.split = prev.split;
    if (prev.recipe?.kit === kit.id) {
      if (prev.recipe.variant === recipe.variant) d.name = prev.name;
      if (prev.filaments?.length) d.filaments = prev.filaments;
    }
  }
  d.meta = { ...(d.meta || {}), templateId: kit.id };
  d.scale = baseScale * ((opts.size ?? 100) / 100);
  d.recipe = { kit: kit.id, variant: recipe.variant, opts, seed: recipe.seed ?? null, dropped: [...dropped] };
  return d;
}

// A legendary weapon starts as the creator's model; a generator starts with
// a random roll.
export function newDesignFromKit(kit, variant = defaultVariant(kit), o = {}) {
  return designFromRecipe(recipeFor(kit, variant, { random: !!kit.generator, ...o }));
}
