import { useState, useEffect } from 'preact/hooks';

const fmt = (v) => (Number.isFinite(v) ? +(+v).toFixed(2) : '');

// Number input that only commits valid numbers, optional slider.
export function Num({ label, value, onChange, min, max, step = 1, unit, slider, hint, disabled, placeholder }) {
  const [text, setText] = useState(value == null ? '' : String(fmt(value)));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(value == null ? '' : String(fmt(value))); }, [value, focus]);
  const commit = (t) => {
    setText(t);
    if (t === '' && placeholder) { onChange(null); return; }
    const v = parseFloat(t);
    if (Number.isFinite(v)) onChange(v);
  };
  return (
    <label class={`field num${slider ? ' has-slider' : ''}`} title={hint}>
      <span class="lbl">{label}</span>
      {slider && (
        <input type="range" min={min} max={max} step={step} value={value ?? min} disabled={disabled}
          onInput={(e) => onChange(parseFloat(e.target.value))} />
      )}
      <span class="inp">
        <input type="number" value={text} step={step} min={min} max={max} disabled={disabled} placeholder={placeholder}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onInput={(e) => commit(e.target.value)} />
        {unit && <em>{unit}</em>}
      </span>
    </label>
  );
}

export function Vec3({ label, value, onChange, step = 1, unit = 'mm', labels = ['X', 'Y', 'Z'] }) {
  return (
    <div class="field vec3">
      <span class="lbl">{label}</span>
      <div class="vec">
        {[0, 1, 2].map((i) => (
          <Mini key={i} tag={labels[i]} value={value[i]} step={step}
            onChange={(v) => { const n = value.slice(); n[i] = v; onChange(n); }} />
        ))}
        {unit && <em>{unit}</em>}
      </div>
    </div>
  );
}

function Mini({ tag, value, onChange, step }) {
  const [text, setText] = useState(String(fmt(value)));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(String(fmt(value))); }, [value, focus]);
  return (
    <span class="mini">
      <i>{tag}</i>
      <input type="number" step={step} value={text} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onInput={(e) => { setText(e.target.value); const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v); }} />
    </span>
  );
}

export function Select({ label, value, options, onChange, hint }) {
  return (
    <label class="field sel" title={hint}>
      <span class="lbl">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export function Check({ label, checked, onChange, hint }) {
  return (
    <label class="field chk" title={hint}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Text({ label, value, onChange }) {
  return (
    <label class="field txt">
      <span class="lbl">{label}</span>
      <input type="text" value={value} onInput={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Color({ label, value, onChange }) {
  return (
    <label class="field color">
      <span class="lbl">{label}</span>
      <input type="color" value={value} onInput={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Section({ title, children, right }) {
  return (
    <section class="sec">
      {title && <h3>{title}{right && <span class="right">{right}</span>}</h3>}
      {children}
    </section>
  );
}

export function Help({ children, warn }) {
  return <p class={warn ? 'help warn' : 'help'}>{children}</p>;
}
