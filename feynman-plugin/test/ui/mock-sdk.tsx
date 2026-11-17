// A fake RemNote for testing the coach in a plain browser.
type Node = { _id: string; text: any[]; backText?: any[]; parent?: string; kids: string[] };
const db: Record<string, Node> = {};
let seq = 0;
export const mock = {
  db,
  storage: {} as Record<string, any>,
  local: {} as Record<string, any>,
  failSync: false,
  slow: 0,
  opened: [] as string[],
  add(text: string, parent?: string, back?: string): string {
    const id = `m${seq++}`;
    db[id] = { _id: id, text: [text], backText: back ? [back] : undefined, parent, kids: [] };
    if (parent) db[parent].kids.push(id);
    return id;
  },
};
(window as any).mock = mock;
const wait = () => new Promise((r) => setTimeout(r, mock.slow));
const remObj = (n: Node): any => ({
  _id: n._id,
  get text() { return n.text; },
  get backText() { return n.backText; },
  parent: n.parent,
  getChildrenRem: async () => { await wait(); return n.kids.map((k) => remObj(db[k])); },
  getTagRems: async () => [],
  setText: async (t: any[]) => { n.text = t; },
  setBackText: async (t: any[]) => { n.backText = t; },
  setParent: async (p: string) => { n.parent = p; db[p].kids.push(n._id); },
  setPracticeDirection: async () => {},
});
const plugin = {
  storage: {
    getSynced: async (k: string) => JSON.parse(JSON.stringify(mock.storage[k] ?? null)),
    setSynced: async (k: string, v: any) => {
      if (mock.failSync) throw new Error('offline');
      mock.storage[k] = JSON.parse(JSON.stringify(v));
    },
    getLocal: async (k: string) => mock.local[k],
    setLocal: async (k: string, v: any) => { mock.local[k] = v; },
  },
  rem: {
    findOne: async (id: string) => (db[id] ? remObj(db[id]) : undefined),
    createRem: async () => { const id = mock.add(''); return remObj(db[id]); },
  },
  richText: {
    toString: async (rt: any[]) => rt.map((x) => (typeof x === 'string' ? x : x.text || (x._id && db[x._id] ? db[x._id].text.join('') : ''))).join(''),
  },
  window: { openRem: async (r: any) => { mock.opened.push(r._id); } },
};
export const usePlugin = () => plugin;
export const renderWidget = () => {};
export const useTrackerPlugin = () => undefined;
export type RNPlugin = any;
export type RichTextInterface = any[];
