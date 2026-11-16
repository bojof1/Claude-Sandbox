import type { RNPlugin, RichTextInterface } from '@remnote/plugin-sdk';

/** Turn RemNote rich text into plain text. */
export function richTextToLabel(rt: RichTextInterface | undefined): string {
  if (!rt) return '';
  let out = '';
  for (const el of rt as any[]) {
    if (typeof el === 'string') out += el;
    else if (el && typeof el === 'object' && typeof el.text === 'string') out += el.text;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Make a new Rem with this text under a parent Rem. Returns its id. */
export async function addChild(plugin: RNPlugin, parentId: string, text: string) {
  const rem = (await plugin.rem.createRem()) as any;
  if (!rem) throw new Error('RemNote did not create the Rem');
  await rem.setText([text]);
  await rem.setParent(parentId);
  return rem._id as string;
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
