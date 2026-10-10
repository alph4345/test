import { MY_MODELS } from './mymodels.js';

export { WISHLIST, REFERENCE_HOWTO } from './wishlist.js';
export const TEMPLATES = MY_MODELS;
export const CATEGORIES = ['All', ...Array.from(new Set(TEMPLATES.map((t) => t.category)))];
export const findTemplate = (id) => TEMPLATES.find((t) => t.id === id);
