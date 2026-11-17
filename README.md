# Bubble Map for RemNote

Bubble Map turns the page you are on into a map of bubbles and branches, then helps you study from it. It sits in the right sidebar, follows whatever page you open, and works on desktop, laptop, iPad and phone.

## What it does

- **Each bubble is one Rem.** The page you are on is the center. Solid lines follow your outline, dashed lines are `[[links]]`, dotted lines are tags. Click a line type at the bottom to hide or show it.
- **Click a bubble** to see a small card: its text, its answer (hidden until you press Show answer), and what it links to. **Double-click** or press **Open** to go to that Rem. The map follows you.
- **Build from the map.** On a bubble's card: **Add bubble**, **Add card** (a front and a back), **Questions** (a fixed set of how and why prompts for a thing, a process or a calculation), **Link to…**, **Unlink**, **Fold**. Double-click empty space to add a bubble to the page. **Link bubbles** joins any two bubbles with a `[[link]]`.
- **Reach** follows links and tags one or more steps away from the page. **Everything** maps the whole knowledge base (best-connected Rems first). **Find** lights up matching bubbles.
- **Save picture** downloads the map as a PNG. The map remembers how you arranged each page.
- Bullets that are only a `[[link]]` fold into the bubble they point to, so each idea is one bubble.

## Study tools

Press **Study** on the map.

- **Redraw from memory.** The map empties to just the topic. Each bubble asks you to explain the idea in your own words (what it does, why, what goes wrong without it). You type your answer, then show your notes and mark each point **Got it** or **Missed**. Click a bubble marked **?** to go a level deeper. Three self-check boxes ask whether you gave the reason, got the direction right, and explained every big word. Only the points you opened are scored; parts you did not reach are listed, not marked wrong. While a redraw runs, the map stays on its page even if you open another page.
- **Redraw from here.** Redraw just one section, from any bubble's card.
- **Copy for grading.** After a redraw, copy your answers next to your notes, ready to paste to any AI or a study partner for marking.
- **Redraw again later.** The Study panel shows each section's last score and when it is due again. **+ Queue** adds one normal RemNote flashcard, so RemNote's own spaced-repetition schedule brings the redraw back on any device. Bubble Map does not run a second scheduler.
- **Needs work.** One list for bubbles missed in a redraw, flashcards you missed, and bullets with `??`, with **Show on map**.
- **Card check.** Colors flashcards that ask for a reason green and ones that only ask for a name orange (a rough guess from the answer length).
- **Card progress colors.** Color bubbles by how their flashcards are going: new, due, weak or strong.

## How to open it

- Open the right sidebar and click the Bubble Map tab. The map follows the page you are on.
- Press **Cmd/Ctrl + G** (or **Cmd/Ctrl + Shift + G**), or type `/Open Bubble Map`, for a large pop-up map.

## How it differs from RemNote's Knowledge Graph

RemNote's Knowledge Graph (global graph from the Omnibar, local graph with `/view graph`) is a way to look at how your notes connect. Bubble Map is built for studying one topic at a time:

- **It sits beside your notes.** The map lives in the right sidebar and redraws around whatever page you open, so you never leave the note you are reading.
- **You can edit from it.** Add bubbles, flashcards and question prompts, and link or unlink notes, right on the map.
- **It tests you.** Redraw from memory turns the map into active recall: explain each part, check against your notes, get a score per section, and see exactly which bubbles you missed.
- **It works with RemNote's spaced repetition.** One tap queues a redraw as a normal flashcard, so RemNote's scheduler brings it back.
- **It shows weak spots.** Card progress colors, the card check and the Needs work list show what to fix, right on the map.
- **It reads like a study map.** Link-only bullets fold into one bubble, helper Rems stay hidden, and each branch gets its own color.

It is not meant to replace the Knowledge Graph's view of your whole database.

## Settings

**Settings > Plugin Settings > Bubble Map**: turn outline, link or tag lines on or off, and set the most bubbles to draw (default 600; lower is faster on big pages).

## Build it yourself

You need [Node.js](https://nodejs.org) LTS (version in `.nvmrc`).

```
npm ci            # installs the exact versions in package-lock.json
npm run build     # checks the manifest, builds into dist/, zips to PluginZip.zip
npm run dev       # optional: live dev server on http://localhost:8080
```

- Manifest: `public/manifest.json` (id `bolurin_graph_view`).
- Source: `src/widgets/` holds the RemNote widgets (sidebar, pop-up, commands, settings). `src/lib/` holds the map and study logic (`GraphView.tsx`, `graphData.ts`).
- `PluginZip.zip` is the file uploaded to the RemNote marketplace.
- To try it in RemNote: run `npm run dev`, then **Settings > Plugins > Build > Develop from localhost**, enter `http://localhost:8080`.

## Privacy

Bubble Map only reads and writes your RemNote notes through the RemNote plugin API. It sends nothing anywhere else. Redraw scores are saved in your RemNote account (plugin storage). "Copy for grading" only copies text to your clipboard.

## Credits

Original code, MIT license. Drawing uses the open-source d3 libraries (ISC license).
