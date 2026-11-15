import type { RNPlugin, RichTextInterface } from '@remnote/plugin-sdk';

/** child = outline (parent and child), ref = [[link]], tag = RemNote tag */
export type LinkKind = 'child' | 'ref' | 'tag';

export interface GNode {
  id: string;
  /** Full text of the Rem. */
  label: string;
  /** Same text with cloze answers swapped for a blank. */
  hiddenLabel: string;
  hasCloze: boolean;
  /** True when the Rem is a flashcard (a cloze, or a front and a back). */
  isCard: boolean;
  degree: number;
  isCenter: boolean;
  /** Which branch (color) the bubble belongs to. */
  group: number;
  // filled in by d3-force
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GLink {
  source: string | GNode;
  target: string | GNode;
  kind: LinkKind;
}

export interface GraphData {
  nodes: GNode[];
  links: GLink[];
  truncated: boolean;
}

export interface GraphOptions {
  showTree: boolean; // parent-child lines
  showRefs: boolean; // reference lines
  showTags: boolean; // tag lines
  maxNodes: number;
}

type RemLike = {
  _id: string;
  parent: string | null;
  children?: string[];
  text?: RichTextInterface;
  backText?: RichTextInterface;
  remsReferencingThis?: () => Promise<RemLike[]>;
  getTagRems?: () => Promise<RemLike[]>;
  taggedRem?: () => Promise<RemLike[]>;
};

const BLANK = '[…]';

/**
 * Turn RemNote rich text into plain text.
 * - names: text of other Rems, used to fill in [[links]]
 * - hideCloze: swap cloze answers for a blank
 */
export function richTextToLabel(
  rt: RichTextInterface | undefined,
  names?: Map<string, string>,
  hideCloze = false
): string {
  if (!rt) return '';
  let out = '';
  let lastWasBlank = false;
  for (const el of rt as any[]) {
    if (typeof el === 'string') {
      out += el;
      lastWasBlank = false;
      continue;
    }
    if (!el || typeof el !== 'object') continue;
    if (hideCloze && el.cId) {
      if (!lastWasBlank) out += BLANK;
      lastWasBlank = true;
      continue;
    }
    lastWasBlank = false;
    if (el.i === 'q' && el._id) out += names?.get(el._id) ?? '';
    else if (typeof el.text === 'string') out += el.text;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function hasCloze(rt: RichTextInterface | undefined): boolean {
  return !!rt && (rt as any[]).some((el) => el && typeof el === 'object' && el.cId);
}

/** Ids of Rems linked inside rich text with [[ ]]. */
export function referencedIds(rt: RichTextInterface | undefined): string[] {
  if (!rt) return [];
  const ids: string[] = [];
  for (const el of rt as any[]) {
    if (el && typeof el === 'object' && el.i === 'q' && el._id) ids.push(el._id);
  }
  return ids;
}

function labelsOf(rem: RemLike, names?: Map<string, string>) {
  const rt = richTextToLabel(rem.text, names) ? rem.text : rem.backText;
  return {
    label: richTextToLabel(rt, names),
    hiddenLabel: richTextToLabel(rt, names, true),
    hasCloze: hasCloze(rt),
    isCard:
      hasCloze(rem.text) ||
      hasCloze(rem.backText) ||
      (!!richTextToLabel(rem.text, names) && !!richTextToLabel(rem.backText, names)),
  };
}

class Builder {
  nodes = new Map<string, GNode>();
  linkKeys = new Set<string>();
  links: GLink[] = [];

  addNode(id: string, rem: RemLike, names: Map<string, string>, isCenter = false) {
    if (this.nodes.has(id)) return;
    const l = labelsOf(rem, names);
    this.nodes.set(id, {
      id,
      label: l.label || 'Untitled',
      hiddenLabel: l.hiddenLabel || 'Untitled',
      hasCloze: l.hasCloze,
      isCard: l.isCard,
      degree: 0,
      isCenter,
      group: 0,
    });
  }

  addLink(a: string, b: string, kind: LinkKind) {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (this.linkKeys.has(key)) return;
    this.linkKeys.add(key);
    this.links.push({ source: a, target: b, kind });
  }

  finish(truncated: boolean): GraphData {
    // only keep lines whose two ends are both bubbles on the map
    const links = this.links.filter(
      (l) => this.nodes.has(l.source as string) && this.nodes.has(l.target as string)
    );
    for (const l of links) {
      this.nodes.get(l.source as string)!.degree++;
      this.nodes.get(l.target as string)!.degree++;
    }
    return { nodes: [...this.nodes.values()], links, truncated };
  }
}

async function safe<T>(fn: (() => Promise<T[]>) | undefined, self: unknown): Promise<T[]> {
  if (!fn) return [];
  try {
    return (await fn.call(self)) || [];
  } catch {
    return [];
  }
}

/** Look up the text of Rems that are only mentioned in [[links]], so labels read in full. */
async function fillNames(plugin: RNPlugin, rems: RemLike[], names: Map<string, string>) {
  const missing = new Set<string>();
  for (const r of rems) {
    for (const id of [...referencedIds(r.text), ...referencedIds(r.backText)]) {
      if (!names.has(id)) missing.add(id);
    }
  }
  if (missing.size === 0) return;
  try {
    const found = ((await plugin.rem.findMany([...missing])) || []) as unknown as RemLike[];
    for (const r of found) if (r) names.set(r._id, labelsOf(r).label);
  } catch {
    // labels just stay shorter
  }
}

/**
 * "This page" map: start at one Rem and walk outward `depth` steps
 * through parents, children, [[links]] and tags.
 */
export async function loadLocalGraph(
  plugin: RNPlugin,
  centerId: string,
  depth: number,
  opts: GraphOptions
): Promise<GraphData> {
  const b = new Builder();
  const names = new Map<string, string>();
  const seen = new Set<string>([centerId]);
  let frontier = [centerId];
  let truncated = false;

  for (let level = 0; level <= depth && frontier.length > 0; level++) {
    const rems = (((await plugin.rem.findMany(frontier)) || []) as unknown as RemLike[]).filter(
      Boolean
    );
    await fillNames(plugin, rems, names);
    const next: string[] = [];
    const last = level === depth;

    // things only RemNote can tell us: who links here, and tags
    const extra = await Promise.all(
      rems.map(async (r) => {
        // at the outer edge we only ask for tags, so the map does not keep growing
        const [back, tags, tagged] = await Promise.all([
          opts.showRefs && !last ? safe(r.remsReferencingThis, r) : [],
          opts.showTags ? safe(r.getTagRems, r) : [],
          opts.showTags && !last ? safe(r.taggedRem, r) : [],
        ]);
        return {
          back: back.map((x) => x._id),
          tags: tags.map((x) => x._id),
          tagged: tagged.map((x) => x._id),
        };
      })
    );

    rems.forEach((rem, i) => {
      // skip blank Rems, but always keep the center bubble
      if (!labelsOf(rem, names).label && rem._id !== centerId) return;
      if (b.nodes.size >= opts.maxNodes) {
        truncated = true;
        return;
      }
      b.addNode(rem._id, rem, names, rem._id === centerId);

      const neighbors: [string, LinkKind][] = [];
      if (opts.showTree) {
        if (rem.parent) neighbors.push([rem.parent, 'child']);
        for (const c of rem.children || []) neighbors.push([c, 'child']);
      }
      if (opts.showRefs) {
        for (const id of [...referencedIds(rem.text), ...referencedIds(rem.backText)])
          neighbors.push([id, 'ref']);
        for (const id of extra[i].back) neighbors.push([id, 'ref']);
      }
      if (opts.showTags) {
        for (const id of [...extra[i].tags, ...extra[i].tagged]) neighbors.push([id, 'tag']);
      }

      for (const [id, kind] of neighbors) {
        b.addLink(rem._id, id, kind);
        if (!last && !seen.has(id)) {
          seen.add(id);
          next.push(id);
        }
      }
    });

    frontier = next;
  }

  const data = b.finish(truncated);
  colorByBranch(data, centerId);
  return data;
}

/** Give each branch coming off the center its own color number. */
function colorByBranch(data: GraphData, centerId: string) {
  const near = new Map<string, string[]>();
  for (const l of data.links) {
    const a = l.source as string;
    const c = l.target as string;
    if (!near.has(a)) near.set(a, []);
    if (!near.has(c)) near.set(c, []);
    near.get(a)!.push(c);
    near.get(c)!.push(a);
  }
  const group = new Map<string, number>([[centerId, 0]]);
  let nextGroup = 1;
  let queue = [centerId];
  while (queue.length) {
    const after: string[] = [];
    for (const id of queue) {
      for (const n of near.get(id) || []) {
        if (group.has(n)) continue;
        group.set(n, id === centerId ? nextGroup++ : group.get(id)!);
        after.push(n);
      }
    }
    queue = after;
  }
  for (const n of data.nodes) n.group = group.get(n.id) ?? 0;
}

/**
 * "Everything" map: the whole knowledge base. To keep it fast,
 * only the best-connected Rems (up to maxNodes) are drawn.
 */
export async function loadGlobalGraph(plugin: RNPlugin, opts: GraphOptions): Promise<GraphData> {
  const all = ((await plugin.rem.getAll()) || []) as unknown as RemLike[];
  const byId = new Map<string, RemLike>();
  const names = new Map<string, string>();
  for (const r of all) {
    const label = labelsOf(r).label;
    if (!label) continue;
    byId.set(r._id, r);
    names.set(r._id, label);
  }

  const raw: [string, string, LinkKind][] = [];
  for (const r of byId.values()) {
    if (opts.showTree && r.parent && byId.has(r.parent)) raw.push([r.parent, r._id, 'child']);
    if (opts.showRefs) {
      for (const id of [...referencedIds(r.text), ...referencedIds(r.backText)]) {
        if (byId.has(id)) raw.push([r._id, id, 'ref']);
      }
    }
  }

  // rank Rems by how many lines touch them; [[links]] count extra
  const score = new Map<string, number>();
  for (const [a, b2, kind] of raw) {
    const w = kind === 'ref' ? 3 : 1;
    score.set(a, (score.get(a) || 0) + w);
    score.set(b2, (score.get(b2) || 0) + w);
  }
  const ranked = [...score.entries()].sort((x, y) => y[1] - x[1]);
  const keep = ranked.slice(0, opts.maxNodes).map(([id]) => id);
  const keepSet = new Set(keep);

  const builder = new Builder();
  for (const id of keep) builder.addNode(id, byId.get(id)!, names);
  for (const [a, b2, kind] of raw) builder.addLink(a, b2, kind);

  // tags: only asked for the bubbles we draw, a few at a time, to stay fast
  if (opts.showTags) {
    for (let i = 0; i < keep.length; i += 40) {
      await Promise.all(
        keep.slice(i, i + 40).map(async (id) => {
          const r = byId.get(id)!;
          for (const t of await safe(r.getTagRems, r)) {
            if (keepSet.has(t._id)) builder.addLink(id, t._id, 'tag');
          }
        })
      );
    }
  }

  const data = builder.finish(ranked.length > opts.maxNodes);

  // color by the top-level document or folder each Rem lives in
  const groupOfRoot = new Map<string, number>();
  for (const n of data.nodes) {
    let cur = byId.get(n.id);
    let hops = 0;
    while (cur?.parent && byId.has(cur.parent) && hops++ < 50) cur = byId.get(cur.parent);
    const root = cur?._id ?? n.id;
    if (!groupOfRoot.has(root)) groupOfRoot.set(root, groupOfRoot.size + 1);
    n.group = groupOfRoot.get(root)!;
  }
  return data;
}
