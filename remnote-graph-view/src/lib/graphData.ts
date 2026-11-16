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
  /** The answer side of a front-and-back card ('' when there is none). */
  back: string;
  /** What a card asks you to recall: the cloze blanks, or the back side. */
  answer: string;
  /** The bubble this one sits under in the outline. */
  parentId: string | null;
  /** Rems this one points at with a [[link]] in its own text. */
  refs: string[];
  /** Bullets that are only a [[link]] to this Rem (they are drawn as part of this bubble). */
  mentions: { id: string; parentId: string | null }[];
  /** Set while the branch under this bubble is folded away: how many bubbles are hidden. */
  folded?: number;
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

/** If a Rem is nothing but one [[link]], return the id it points at. */
function soleReference(rt: RichTextInterface | undefined): string | undefined {
  if (!rt) return undefined;
  const parts = (rt as any[]).filter((el) => {
    // ignore spaces around the link, plain or formatted
    if (typeof el === 'string') return !!el.trim();
    return !(el && el.i !== 'q' && typeof el.text === 'string' && !el.text.trim());
  });
  return parts.length === 1 && parts[0]?.i === 'q' && parts[0]._id ? parts[0]._id : undefined;
}

/** RemNote keeps hidden helper Rems (saved searches) whose text starts with "query:". */
function isHelper(rem: RemLike): boolean {
  return richTextToLabel(rem.text).startsWith('query:');
}

function labelsOf(rem: RemLike, names?: Map<string, string>) {
  const rt = richTextToLabel(rem.text, names) ? rem.text : rem.backText;
  // RemNote keeps hidden helper Rems (saved searches) that start with "query:"; leave them out
  if (richTextToLabel(rt, names).startsWith('query:'))
    return { label: '', hiddenLabel: '', back: '', answer: '', hasCloze: false, isCard: false };
  const back = rt === rem.text ? richTextToLabel(rem.backText, names) : '';
  const blanks = [...((rem.text as any[]) || []), ...((rem.backText as any[]) || [])]
    .filter((el) => el && typeof el === 'object' && el.cId)
    .map((el) => (el.i === 'q' ? names?.get(el._id) ?? '' : el.text ?? ''))
    .join(' ')
    .trim();
  return {
    back,
    answer: blanks || back,
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
  /** Bullets that are only a [[link]]: bullet id -> the Rem it points at. */
  alias = new Map<string, string>();
  parentOf = new Map<string, string | null>();

  addNode(id: string, rem: RemLike, names: Map<string, string>, isCenter = false) {
    if (this.nodes.has(id)) return;
    this.parentOf.set(id, rem.parent);
    const target = soleReference(rem.text);
    if (target && !isCenter && !rem.backText?.length) this.alias.set(id, target);
    const l = labelsOf(rem, names);
    this.nodes.set(id, {
      id,
      label: l.label || 'Untitled',
      hiddenLabel: l.hiddenLabel || 'Untitled',
      hasCloze: l.hasCloze,
      isCard: l.isCard,
      back: l.back,
      answer: l.answer,
      parentId: rem.parent,
      refs: [...new Set([...referencedIds(rem.text), ...referencedIds(rem.backText)])],
      mentions: [],
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

  /**
   * A bullet that is only a [[link]] (say, a bullet that just says [[DMSO]]) is folded into
   * the bubble it points at. So each idea is one bubble, joined to every place that mentions it.
   */
  private foldAliases() {
    const to = (id: string) => {
      let cur = id;
      for (let i = 0; i < 5; i++) {
        const next = this.alias.get(cur);
        if (!next || !this.nodes.has(next) || !this.nodes.has(cur)) break;
        cur = next;
      }
      return cur;
    };
    const old = this.links;
    this.links = [];
    this.linkKeys = new Set();
    for (const l of old) {
      const a = l.source as string;
      const b = l.target as string;
      const a2 = to(a);
      const b2 = to(b);
      let kind = l.kind;
      // the line from the bullet's parent now points at the idea itself, so it is a link line
      if (kind === 'child' && ((a2 !== a && this.parentOf.get(a) === b) || (b2 !== b && this.parentOf.get(b) === a)))
        kind = 'ref';
      this.addLink(a2, b2, kind);
    }
    for (const id of [...this.nodes.keys()]) {
      const t = to(id);
      if (t === id) continue;
      this.nodes.get(t)!.mentions.push({ id, parentId: this.parentOf.get(id) ?? null });
      this.nodes.delete(id);
    }
    // bullets that sat under a folded bullet now sit under the idea itself
    for (const n of this.nodes.values()) if (n.parentId) n.parentId = to(n.parentId);
  }

  finish(truncated: boolean): GraphData {
    this.foldAliases();
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
 * "This page" map. Everything nested under the page is always shown, however deep.
 * `depth` (Reach) is how many steps to follow beyond that: [[links]], tags and parents.
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
  /** The page itself and everything nested below it. */
  const under = new Set<string>([centerId]);
  let frontier = [centerId];
  let truncated = false;

  for (let hop = 0; hop <= depth && frontier.length > 0; hop++) {
    const nextHop: string[] = [];
    const last = hop === depth;
    let batch = frontier;

    // keep going down the outline inside this step, so nothing under the page is cut off
    while (batch.length > 0) {
      const rems = (((await plugin.rem.findMany(batch)) || []) as unknown as RemLike[]).filter(
        Boolean
      );
      await fillNames(plugin, rems, names);
      const deeper: string[] = [];

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
        const isUnder = under.has(rem._id);
        const kids = rem.children || [];
        if (isHelper(rem)) return;
        // skip blank Rems, unless they hold part of the page's outline together
        if (!labelsOf(rem, names).label && !(isUnder && (kids.length > 0 || rem._id === centerId)))
          return;
        if (b.nodes.size >= opts.maxNodes) {
          truncated = true;
          return;
        }
        b.addNode(rem._id, rem, names, rem._id === centerId);

        const neighbors: [string, LinkKind][] = [];
        if (opts.showTree) {
          if (rem.parent) neighbors.push([rem.parent, 'child']);
          for (const c of kids) {
            if (!isUnder) {
              neighbors.push([c, 'child']);
              continue;
            }
            b.addLink(rem._id, c, 'child');
            under.add(c);
            if (!seen.has(c)) {
              seen.add(c);
              deeper.push(c);
            }
          }
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
            nextHop.push(id);
          }
        }
      });

      batch = deeper;
    }

    frontier = nextHop;
  }

  const data = b.finish(truncated);
  colorByBranch(data, centerId);
  return data;
}

/** Add a [[link]] from one Rem to another by putting it at the end of the first Rem's text. */
export async function addReference(plugin: RNPlugin, fromId: string, toId: string) {
  if (fromId === toId) return 'same';
  const from = (await plugin.rem.findOne(fromId)) as any;
  if (!from) return 'missing';
  const text: any[] = from.text || [];
  if ([...referencedIds(from.text), ...referencedIds(from.backText)].includes(toId)) return 'exists';
  // Same name on both ends (a bullet "Media" linked to the Rem "Media"): swap the word for
  // the link instead of writing the name twice.
  const to = (await plugin.rem.findOne(toId)) as any;
  const same =
    !!to &&
    !from.backText?.length &&
    richTextToLabel(from.text).toLowerCase() === labelsOf(to).label.toLowerCase();
  await from.setText(same ? [{ i: 'q', _id: toId }] : [...text, ' ', { i: 'q', _id: toId }]);
  return 'added';
}

/** Remove every [[link]] to one Rem from another Rem's text. The rest of the text stays. */
export async function removeReference(plugin: RNPlugin, fromId: string, toId: string) {
  const from = (await plugin.rem.findOne(fromId)) as any;
  if (!from) return false;
  const strip = (rt: any[] | undefined) => {
    if (!rt) return rt;
    const out = rt.filter((el) => !(el && typeof el === 'object' && el.i === 'q' && el._id === toId));
    // drop the space that was left hanging at the end
    while (out.length > 1 && typeof out[out.length - 1] === 'string' && !out[out.length - 1].trim())
      out.pop();
    return out;
  };
  let text = strip(from.text);
  const back = strip(from.backText);
  // if the link was all there was, leave the plain word behind instead of an empty bullet
  if (text && !richTextToLabel(text) && !richTextToLabel(back) && (from.text || []).length) {
    const to = (await plugin.rem.findOne(toId)) as any;
    const word = to ? labelsOf(to).label : '';
    if (word) text = [word];
  }
  let changed = false;
  const had = (rt: any[] | undefined) =>
    !!rt && rt.some((el) => el && typeof el === 'object' && el.i === 'q' && el._id === toId);
  if (text && had(from.text)) {
    await from.setText(text);
    changed = true;
  }
  if (back && had(from.backText)) {
    await from.setBackText(back);
    changed = true;
  }
  return changed;
}

/** Make a new Rem with this text under a parent Rem. Returns its id. */
export async function addChild(plugin: RNPlugin, parentId: string, text: string, back?: string) {
  const rem = (await plugin.rem.createRem()) as any;
  if (!rem) throw new Error('RemNote did not create the Rem');
  await rem.setText([text]);
  await rem.setParent(parentId);
  if (back) {
    // a front and a back make it a flashcard
    await rem.setBackText([back]);
    try {
      await rem.setPracticeDirection('forward');
    } catch {
      // older RemNote: the card still exists with its default direction
    }
  }
  return rem._id as string;
}

/**
 * Is a flashcard asking for a reason, or just a name?
 * A rough guess: an answer of three or more words, or one with a "because" word in it,
 * is treated as a reason. One or two words is treated as a name.
 */
export function cardKind(n: GNode): 'why' | 'name' | null {
  if (!n.isCard) return null;
  const a = n.answer.trim();
  if (!a) return null;
  if (/\b(because|so that|therefore|which means|leads? to|causes?|results? in)\b/i.test(a)) return 'why';
  return a.split(/\s+/).length >= 3 ? 'why' : 'name';
}

/** The fixed question sets: pick by the shape of the topic. */
export const QUESTION_SETS: Record<string, string[]> = {
  Thing: [
    'What turns it on, and why?',
    'Where is it, and why there?',
    'What happens next?',
    'What if it breaks?',
  ],
  Process: [
    'What starts it?',
    'What are the steps, in order?',
    'What sets the rate (the limiting step)?',
    'What breaks the chain?',
  ],
  Calculation: [
    "What's given?",
    "What's asked?",
    'Which equation, and why that one?',
    'Does the answer make sense?',
  ],
};

export type Study = 'new' | 'due' | 'weak' | 'strong';

/** How each flashcard bubble is doing: new, due now, weak (missed last time) or strong. */
export async function loadStudy(plugin: RNPlugin, ids: string[]): Promise<Map<string, Study>> {
  const out = new Map<string, Study>();
  const now = Date.now();
  for (let i = 0; i < ids.length; i += 40) {
    const rems = (((await plugin.rem.findMany(ids.slice(i, i + 40))) || []) as any[]).filter(Boolean);
    await Promise.all(
      rems.map(async (r) => {
        let cards: any[] = [];
        try {
          cards = (await r.getCards()) || [];
        } catch {
          return;
        }
        if (!cards.length) return;
        let worst: Study = 'strong';
        const rank = { strong: 0, new: 1, weak: 2, due: 3 };
        for (const c of cards) {
          const hist: any[] = (c.repetitionHistory || []).filter((h: any) => h.score <= 1.5);
          let s: Study = 'strong';
          if (!hist.length) s = 'new';
          else if (c.nextRepetitionTime && c.nextRepetitionTime <= now) s = 'due';
          else if (hist[hist.length - 1].score === 0) s = 'weak';
          if (rank[s] > rank[worst]) worst = s;
        }
        out.set(r._id, worst);
      })
    );
  }
  return out;
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
  // If the page has a single main branch, walk down it and start the colors where it fans out.
  let split = centerId;
  for (let i = 0; i < 6; i++) {
    const open = (near.get(split) || []).filter((n) => !group.has(n));
    const forks = open.filter((n) => (near.get(n) || []).length > 1);
    if (forks.length !== 1 || open.length > 3) break;
    for (const n of open) group.set(n, nextGroup++);
    split = forks[0];
  }
  let queue = [split];
  while (queue.length) {
    const after: string[] = [];
    for (const id of queue) {
      for (const n of near.get(id) || []) {
        if (group.has(n)) continue;
        group.set(n, id === split ? nextGroup++ : group.get(id)!);
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
