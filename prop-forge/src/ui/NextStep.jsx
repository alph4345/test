import { setUI } from '../state.js';

// "Next step" button at the bottom of a panel, so the steps can be followed
// in order without hunting for the tabs.
export function NextStep({ tab, label }) {
  return (
    <div class="next-step">
      <button class="primary wide" onClick={() => setUI({ tab, sel: null })}>Next: {label} →</button>
    </div>
  );
}
