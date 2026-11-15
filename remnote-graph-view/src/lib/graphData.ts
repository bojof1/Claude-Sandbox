import type { RNPlugin, RichTextInterface } from '@remnote/plugin-sdk';

export type LinkKind = 'child' | 'ref';

export interface GNode {
  id: string;
  label: string;
  degree: number;
  isCenter: boolean;
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
  maxNodes: number;
}

type RemLike = {
  _id: string;
  parent: string | null;
  children?: string[];
  text?: RichTextInterface;
  backText?: RichTextInterface;
};

/** Turn RemNote rich text into a plain label, without extra API calls. */
export function richTextToLabel(rt: RichTextInterface | undefined): string {
  if (!rt) return '';
  let out = '';
  for (const el of rt as any[]) {
    if (typeof el === 'string') out += el;
    else if (el && typeof el.text === 'string') out += el.text;
    else if (el && el.i === 'x' && typeof el.text === 'string') out += el.text; // LaTeX
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Ids of Rems referenced inside rich text ([[links]] and tags written inline). */
export function referencedIds(rt: RichTextInterface | undefined): string[] {
  if (!rt) return [];
  const ids: string[] = [];
  for (const el of rt as any[]) {
    if (el && typeof el === 'object' && el.i === 'q' && el._id) ids.push(el._id);
  }
  return ids;
}

function labelOf(rem: RemLike): string {
  const front = richTextToLabel(rem.text);
  if (front) return front;
  return richTextToLabel(rem.backText);
}

class Builder {
  nodes = new Map<string, GNode>();
  linkKeys = new Set<string>();
  links: GLink[] = [];

  addNode(id: string, label: string, isCenter = false) {
    if (!this.nodes.has(id)) this.nodes.set(id, { id, label, degree: 0, isCenter });
  }

  addLink(a: string, b: string, kind: LinkKind) {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (this.linkKeys.has(key)) return;
    this.linkKeys.add(key);
    this.links.push({ source: a, target: b, kind });
  }

  finish(truncated: boolean): GraphData {
    // only keep lines whose two ends are both dots on the map
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

/**
 * "This page" graph: start at one Rem and walk outward `depth` steps
 * through parents, children and references (like Obsidian's local graph).
 */
export async function loadLocalGraph(
  plugin: RNPlugin,
  centerId: string,
  depth: number,
  opts: GraphOptions
): Promise<GraphData> {
  const b = new Builder();
  const seen = new Set<string>([centerId]);
  let frontier = [centerId];
  let truncated = false;

  for (let level = 0; level <= depth && frontier.length > 0; level++) {
    const rems = ((await plugin.rem.findMany(frontier)) || []) as unknown as RemLike[];
    const next: string[] = [];

    const backlinks: string[][] = await Promise.all(
      rems.map(async (r) => {
        if (!opts.showRefs || level === depth) return [];
        try {
          const full = await plugin.rem.findOne(r._id);
          const refs = (await full?.remsReferencingThis()) || [];
          return refs.map((x) => x._id);
        } catch {
          return [];
        }
      })
    );

    rems.forEach((rem, i) => {
      if (!rem) return;
      const label = labelOf(rem);
      // skip blank Rems, but always keep the center dot
      if (!label && rem._id !== centerId) return;
      if (b.nodes.size >= opts.maxNodes) {
        truncated = true;
        return;
      }
      b.addNode(rem._id, label || 'Untitled', rem._id === centerId);

      const neighbors: [string, LinkKind][] = [];
      if (opts.showTree) {
        if (rem.parent) neighbors.push([rem.parent, 'child']);
        for (const c of rem.children || []) neighbors.push([c, 'child']);
      }
      if (opts.showRefs) {
        for (const id of [...referencedIds(rem.text), ...referencedIds(rem.backText)])
          neighbors.push([id, 'ref']);
        for (const id of backlinks[i]) neighbors.push([id, 'ref']);
      }

      for (const [id, kind] of neighbors) {
        b.addLink(rem._id, id, kind);
        if (level < depth && !seen.has(id)) {
          seen.add(id);
          next.push(id);
        }
      }
    });

    frontier = next;
  }

  return b.finish(truncated);
}

/**
 * "Everything" graph: the whole knowledge base. To keep it fast,
 * only the best-connected Rems (up to maxNodes) are drawn.
 */
export async function loadGlobalGraph(plugin: RNPlugin, opts: GraphOptions): Promise<GraphData> {
  const all = ((await plugin.rem.getAll()) || []) as unknown as RemLike[];
  const byId = new Map<string, RemLike>();
  const labels = new Map<string, string>();
  for (const r of all) {
    const label = labelOf(r);
    if (!label) continue;
    byId.set(r._id, r);
    labels.set(r._id, label);
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

  // rank Rems by how many lines touch them; references count extra
  const score = new Map<string, number>();
  for (const [a, b2, kind] of raw) {
    const w = kind === 'ref' ? 3 : 1;
    score.set(a, (score.get(a) || 0) + w);
    score.set(b2, (score.get(b2) || 0) + w);
  }
  const ranked = [...score.entries()].sort((x, y) => y[1] - x[1]);
  const keep = new Set(ranked.slice(0, opts.maxNodes).map(([id]) => id));

  const builder = new Builder();
  for (const id of keep) builder.addNode(id, labels.get(id) || 'Untitled');
  for (const [a, b2, kind] of raw) builder.addLink(a, b2, kind);
  return builder.finish(ranked.length > opts.maxNodes);
}
