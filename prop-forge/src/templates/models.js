// Registry of the creator's bundled models. The unreleased set lives in a
// git-ignored module; `npm run build` / `npm test` create an empty stand-in
// when it is missing (see scripts/ensure-unreleased.mjs).
import * as published from './bundled-models.js';
import * as unreleased from './bundled-unreleased.js';

export const MODEL_DATA = { ...published.MODELS, ...unreleased.MODELS };
export const MODEL_THUMBS = { ...published.THUMBS, ...unreleased.THUMBS };
export const hasModel = (key) => key in MODEL_DATA;
