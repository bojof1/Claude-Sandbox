import type { RNPlugin, RichTextInterface } from '@remnote/plugin-sdk';

/** Plain text from a Rem's rich text. */
export function richTextToLabel(text: RichTextInterface | undefined): string {
  if (!text) return '';
  let out = '';
  for (const part of text as any[]) {
    if (typeof part === 'string') out += part;
    else if (part && typeof part === 'object' && typeof part.text === 'string') out += part.text;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Add a plain Rem under a parent. Returns the new Rem's id. */
export async function addChild(plugin: RNPlugin, parentId: string, text: string): Promise<string> {
  const rem = await plugin.rem.createRem();
  if (!rem) throw new Error('RemNote did not create the Rem');
  await rem.setText([text]);
  await rem.setParent(parentId);
  return rem._id;
}

/** Add a front/back flashcard under a parent. Returns the new Rem's id. */
export async function addCard(plugin: RNPlugin, parentId: string, front: string, back: string): Promise<string> {
  const rem = await plugin.rem.createRem();
  if (!rem) throw new Error('RemNote did not create the Rem');
  await rem.setText([front]);
  await rem.setBackText([back]);
  await rem.setParent(parentId);
  try {
    await rem.setPracticeDirection('forward');
  } catch {}
  return rem._id;
}

/** Copy text to the clipboard. Falls back to the old execCommand route inside the plugin iframe. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
