// The creator's unreleased models are git-ignored. Fresh clones get an
// empty module so the app still builds and tests still run.
import fs from 'fs';
const file = new URL('../src/templates/bundled-unreleased.js', import.meta.url);
if (!fs.existsSync(file)) fs.writeFileSync(file, '// Empty: no unreleased models in this checkout.\nexport const MODELS = {};\nexport const THUMBS = {};\n');
const shapes = new URL('../src/templates/unreleased-shapes.js', import.meta.url);
if (!fs.existsSync(shapes)) fs.writeFileSync(shapes, '// Empty: no unreleased outlines in this checkout.\nexport const SHAPES = {};\n');
