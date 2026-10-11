// Staffs that come apart: printed sections that screw together around a
// core (wooden dowel or aluminium tube) that carries the weight. Printed
// plastic alone bends and snaps at the joints of a long staff with a heavy
// head; the printed threads only hold the sections together and line them
// up, the core takes the load.
import { cyl } from '../templates/helpers.js';
import { choice } from './core.js';

// minStaff: thinnest staff that still fits a printed thread around the core
export const CORES = {
  none: { label: 'None (printed only)', d: 0, minStaff: 0 },
  dowel12: { label: '1/2 in hardwood dowel', d: 12.7, minStaff: 28, buy: '1/2 in (12.7 mm) hardwood dowel: oak, birch or maple, not pine' },
  dowel16: { label: '5/8 in hardwood dowel', d: 15.88, minStaff: 32, buy: '5/8 in (15.9 mm) hardwood dowel: oak, birch or maple' },
  tube16: { label: '16 mm aluminium tube (strongest)', d: 16.1, minStaff: 32, buy: '16 mm (or 5/8 in) aluminium tube, 1–1.5 mm wall' },
};
export const SPIGOT = 60; // core left sticking out of a section to plug into the next

export const staffStrength = ({ apart = 2, core = 'dowel12' } = {}) => [
  choice('apart', 'Comes apart into', [1, 2, 3, 4].map((n) => ({ v: n, label: n === 1 ? 'One piece' : `${n} sections` })), apart, {
    random: false, hint: 'Sections screw together for travel. The printer may need more pieces than this; the extra cuts are glued for good.',
  }),
  choice('core', 'Core inside the staff', Object.entries(CORES).map(([v, c]) => ({ v, label: c.label })), core, {
    random: false, hint: 'The core carries the weight of the head, so the staff doesn\'t bend or snap at a joint. It runs up into the head, and at each take-apart joint 6 cm of it sticks out of the lower section into the one above, inside the screw thread. 5/8 in cores need a staff at least 32 mm thick.',
  }),
];

// Thicken the staff to fit the chosen core (the slider follows).
export function fixStaff(o, key = 'staffD') {
  const c = CORES[o.core] || CORES.none;
  if (o.staff !== 'rod' && c.minStaff && (o[key] || 0) < c.minStaff) o[key] = c.minStaff;
  return o;
}

// The core's channel through every part of the staff piece (`group` is its
// `separate` name), from `y0` up to `y1`.
export function coreChannel(o, group, y0, y1) {
  const c = CORES[o.core] || CORES.none;
  if (!c.d) return [];
  const r = c.d / 2 + 0.2;
  return [cyl('Core channel', r, r, y1 - y0, [0, (y0 + y1) / 2, 0], { op: 'subtract', target: group, sides: 32 })];
}

// The staff's take-apart plan, carried by its main part.
export const apartPlan = (o) => ({ joint: 'thread', apart: o.apart || 1, glueJoint: CORES[o.core]?.d ? 'none' : 'auto' });

export function staffNotes(o, coreLen) {
  const c = CORES[o.core] || CORES.none;
  const n = o.apart || 1;
  const notes = [];
  if (c.d) {
    const total = Math.ceil((coreLen + (n - 1) * SPIGOT) / 10) * 10;
    notes.push(`Staff core: ${c.buy}, ${total} mm in all${n > 1 ? `, cut into ${n} lengths at the take-apart joints (each one ${SPIGOT} mm longer than its section, except the top one)` : ''}. Epoxy it into the printed pieces.`);
  } else {
    notes.push('The staff has no core: printed plastic alone can bend or snap at a joint under a heavy head. A 1/2 in hardwood dowel or a 16 mm aluminium tube inside makes it far stronger (Strength options).');
  }
  return notes;
}

export const staffSteps = (o) => {
  const c = CORES[o.core] || CORES.none;
  const n = o.apart || 1;
  if (!c.d) return [];
  return [
    `Staff: slide the printed pieces of each section onto its length of core and glue the faces (epoxy). The core runs through the glued joints; only the ${n > 1 ? 'screw joints come apart' : 'head comes off'}.`,
    ...(n > 1 ? [`At each screw joint, glue the core into the lower section with ${SPIGOT} mm sticking out; it slides into the upper section as the thread screws together.`] : []),
  ];
};
