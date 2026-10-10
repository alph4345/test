import { createHandler, transferList } from './handler.js';

const h = createHandler(async () => undefined);

self.onmessage = async (ev) => {
  const { id } = ev.data;
  try {
    const result = await h.handle(ev.data);
    self.postMessage({ id, ok: true, result }, transferList(result));
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
