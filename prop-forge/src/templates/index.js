import pop from './popculture.js';
import classic from './classic.js';

export const TEMPLATES = [...pop, ...classic];
export const CATEGORIES = ['All', ...Array.from(new Set(TEMPLATES.map((t) => t.category)))];
export const findTemplate = (id) => TEMPLATES.find((t) => t.id === id);
