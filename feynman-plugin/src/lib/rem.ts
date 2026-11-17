import type { RNPlugin, RichTextInterface } from '@remnote/plugin-sdk';
import type { NoteNode } from './analyze';

/** Turn RemNote rich text into plain text without asking RemNote (no reference names). */
export function richTextToLabel(rt: RichTextInterface | undefined): string {
  if (!rt) return '';
  let out = '';
  for (const el of rt as any[]) {
    if (typeof el === 'string') out += el;
    else if (el && typeof el === 'object' && typeof el.text === 'string') out += el.text;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Plain text with reference names filled in, falling back to the simple version. */
async function toText(plugin: RNPlugin, rt: RichTextInterface | undefined): Promise<string> {
  if (!rt || !(rt as any[]).length) return '';
  try {
    const s = await plugin.richText.toString(rt);
    if (typeof s === 'string') return s.replace(/\s+/g, ' ').trim();
  } catch {
    // fall through
  }
  return richTextToLabel(rt);
}

/** Ids of Rems this rich text points to. */
function refIds(rt: RichTextInterface | undefined): string[] {
  const out: string[] = [];
  for (const el of (rt as any[]) || []) if (el && typeof el === 'object' && el.i === 'q' && el._id) out.push(el._id);
  return out;
}

/** The start of the queue card's front, so the coach can skip its own cards. */
export const QUEUE_FRONT = 'Teach from memory:';

export interface Loaded {
  name: string;
  root: NoteNode;
  /** Ids of other Rems linked from these notes, by tags or references. */
  linked: string[];
  count: number;
  /** True if the page was too big and only the top part was read. */
  cut: boolean;
}

/**
 * Read a page and everything under it, level by level, up to `cap` Rems.
 * Hidden helper Rems (saved searches) and empty lines are left out.
 */
export async function loadPage(plugin: RNPlugin, pageId: string, cap = 400): Promise<Loaded | null> {
  const page = (await plugin.rem.findOne(pageId)) as any;
  if (!page) return null;
  const name = (await toText(plugin, page.text)) || 'Untitled';
  const root: NoteNode = { id: page._id, text: name, children: [] };
  const linked = new Set<string>();
  let count = 0;
  let cut = false;
  let level: { rem: any; node: NoteNode }[] = [{ rem: page, node: root }];
  for (let depth = 0; depth < 7 && level.length; depth++) {
    const next: typeof level = [];
    const kids = await Promise.all(
      level.map(async (x) => {
        try {
          return ((await x.rem.getChildrenRem()) || []) as any[];
        } catch {
          return [] as any[];
        }
      }),
    );
    for (let i = 0; i < level.length; i++) {
      for (const child of kids[i]) {
        if (count >= cap) {
          cut = true;
          break;
        }
        const front = await toText(plugin, child.text);
        // saved searches, and this plugin's own queue cards, are not notes
        if (/^query:/i.test(front) || front.startsWith(QUEUE_FRONT)) continue;
        const back = await toText(plugin, child.backText);
        const text = back ? `${front} — ${back}` : front;
        for (const id of [...refIds(child.text), ...refIds(child.backText)]) linked.add(id);
        const node: NoteNode = { id: child._id, text, children: [] };
        count++;
        if (text) level[i].node.children.push(node);
        next.push({ rem: child, node: text ? node : level[i].node });
      }
    }
    level = next;
  }
  // tags and the parent page are linked ideas too
  try {
    for (const t of (await page.getTagRems()) || []) linked.add(t._id);
  } catch {
    // older RemNote
  }
  if (page.parent) linked.add(page.parent);
  linked.delete(page._id);
  return { name, root, linked: [...linked].slice(0, 30), count, cut };
}

/** Names for a list of Rem ids (skipping any that are gone or empty). */
export async function namesOf(plugin: RNPlugin, ids: string[]): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = [];
  for (const id of ids.slice(0, 30)) {
    try {
      const r = (await plugin.rem.findOne(id)) as any;
      const name = r ? await toText(plugin, r.text) : '';
      if (name && !/^query:/i.test(name) && name.length <= 80) out.push({ id, name });
    } catch {
      // skip
    }
    if (out.length >= 8) break;
  }
  return out;
}

/** Make a flashcard under a page so RemNote's own queue brings the concept back. Returns its id. */
export async function addQueueCard(plugin: RNPlugin, parentId: string, front: string, back: string) {
  const rem = (await plugin.rem.createRem()) as any;
  if (!rem) throw new Error('RemNote did not create the Rem');
  await rem.setText([front]);
  await rem.setBackText([back]);
  await rem.setParent(parentId);
  try {
    await rem.setPracticeDirection('forward');
  } catch {
    // older RemNote: the card still exists
  }
  return rem._id as string;
}

/** Copy text for pasting somewhere else. Returns false if the browser would not allow it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
