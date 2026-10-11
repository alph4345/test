// The Forge catalog: one card per weapon kit (see src/kits).
import { KITS, newDesignFromKit } from '../kits/index.js';

export { WISHLIST, REFERENCE_HOWTO } from './wishlist.js';

export const TEMPLATES = KITS.map((kit) => ({
  id: kit.id, name: kit.name, category: kit.category, source: kit.source, blurb: kit.blurb, credit: kit.credit,
  kit, generator: !!kit.generator, thumb: kit.thumb, build: (o) => newDesignFromKit(kit, undefined, o),
}));
export const CATEGORIES = ['All', ...Array.from(new Set(TEMPLATES.filter((t) => !t.generator).map((t) => t.category)))];
export const findTemplate = (id) => TEMPLATES.find((t) => t.id === id);
