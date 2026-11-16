# Bubble Map for RemNote

See your notes as a map of bubbles and branches, like a hand-drawn mind map.

- Each **bubble** is one Rem (one bullet). The **gold bubble** is the page you are on.
- **Solid lines** follow your outline (parent and child). Each branch gets its own color. Everything under the page shows, however deep.
- **Dashed lines** are `[[links]]`. **Dotted lines** are tags.
- **Click** a bubble to go to that Rem. The map follows you there.
- **Link bubbles**: click one bubble, then another, to add a `[[link]]` between them. The link is added to the end of the first bubble's text.
- The map **updates by itself** a moment after you stop typing. The ↻ button redraws it right away.
- **Drag** a bubble and let go to watch it spring back. **Scroll** or pinch to zoom. **Fit** shows the whole map.
- **Point** at a bubble to read it in full and see what it touches.
- Names hide when they would overlap, so the map stays readable. Zoom in to see more.
- **Answers hidden** blanks out cloze answers so you can quiz yourself from the map.
- **Cards only** keeps your flashcards and the ideas they link to.
- Click a line type at the bottom to hide or show it.
- **Reach** is how many steps to follow links and tags away from the page. **Everything** maps your whole knowledge base (most connected Rems first).
- **Find** lights up bubbles that match what you type.

## How to open it in RemNote

- Open the right sidebar and click the bubble icon. The map follows the page you are on.
- Or press **Cmd + Shift + G**, or type `/Open Bubble Map`, for a big pop-up map.

## Study tools (1.0)

Press **Study** on the map.

- **Redraw from memory.** The map empties to just the topic. Each bubble asks you a question about the idea (what it does, why, what goes wrong without it). You type your answer in your own words, show your notes, and mark each point Got it or Missed. Then you go a level down. You get a score, missed bubbles turn orange, and the score is saved per page so the map can remind you to redraw after a week. At the end, **Copy for grading** gives you your answers next to your notes, ready to paste to an AI for marking. Explaining from memory is retrieval practice, which is one of the best-supported study methods.
- **Redraw from here.** Click any bubble and redraw just that section. Only the points you open are scored, and parts you did not reach are listed, not marked wrong. After your notes show, three self-check boxes ask if you gave the reason, got the direction right, and explained every big word.
- **Redraw again later.** The Study panel shows when each section is due again. "+ Queue" adds one reminder flashcard, so RemNote's own schedule brings the redraw back, on any device.
- **Needs work.** One list and one color mode for bubbles missed in a redraw, cards you missed, and bullets with `??`.
- **Card check.** Counts the flashcards on the map and guesses which ask for a reason and which only ask for a name (answers of one or two words). Aim for at least half reason cards, and 10 to 15 cards per lecture.
- **Open questions.** Any bullet with `??` in it is listed, so you can take the list to office hours.
- **Add card / Questions.** From a bubble's card, add a why or what-if flashcard, or add a fixed set of questions for a thing, a process or a calculation.
- **Card progress colors**, **fold**, **save picture**, and the map remembers how you arranged each page.

A matching plugin, **Why Loop** (folder `why-loop-plugin` in this repo), tracks the rest of the study loop: lecture steps, a miss log and a weekly number. The two work on their own.

## Load it on your Mac (local dev plugin)

You need [Node.js](https://nodejs.org) (the LTS version) installed once.

1. Download this folder (`remnote-graph-view`) to your Mac.
2. Open the Terminal app and go to the folder: `cd path/to/remnote-graph-view`
3. Run `npm install` (only the first time).
4. Run `npm run dev` and leave that Terminal window open.
5. In RemNote, go to **Settings > Plugins > Build > Develop from localhost**.
6. Type `http://localhost:8080` and click **Develop**.

The plugin stays loaded while `npm run dev` is running. Next time, just do steps 2 and 4.

## Build it yourself

You need [Node.js](https://nodejs.org) LTS (the version is in `.nvmrc`).

```
cd remnote-graph-view
npm ci            # installs the exact versions in package-lock.json
npm run build     # webpack build into dist/, zipped to PluginZip.zip
npm run dev       # optional: live dev server on http://localhost:8080
```

- The manifest is `public/manifest.json` (id `bolurin_graph_view`, version 1.1.0). It is copied into `dist/` by the build.
- Source code is in `src/`: `src/widgets/` holds the RemNote widgets (sidebar, pop-up, commands), `src/lib/` holds the map and study logic (`GraphView.tsx`, `graphData.ts`).
- `PluginZip.zip` is exactly what gets uploaded to the RemNote marketplace.

## How this differs from RemNote's Knowledge Graph

RemNote Pro has a Knowledge Graph (global graph from the Omnibar, local graph with `/view graph`). Based on RemNote's help article, Bubble Map is different in these ways:

- **Works on the free plan.** The Knowledge Graph is a Pro feature. Bubble Map does not need Pro.
- **Lives in the right sidebar and follows you.** It redraws around whatever page you have open, so the map is always next to the note you are reading. Cmd/Ctrl+G opens a large pop-up view.
- **Editing from the map.** You can add a bubble, add a flashcard, add a set of question prompts, and link or unlink two bubbles right from the map. The Knowledge Graph is for viewing.
- **Study tools built on the map.** "Redraw from memory" hides the bubble names and asks you to explain each part in your own words, with self-checks and a score per section. "+ Queue" makes a normal RemNote flashcard so RemNote's own spaced-repetition scheduler brings the redraw back (Bubble Map does not run a second scheduler). There is also a card check (does each card ask for a reason, not just a name), a "Needs work" list, and a list of open `??` questions.
- **Card progress on the map.** Bubbles can be colored by how well their flashcards are going, so weak spots stand out.
- **Cleaner layout for study notes.** Bullets that only hold a link fold into one bubble, and helper Rems (query and redraw cards) are hidden.
- **Save picture.** Export the current map as an image.

Bubble Map does not replace the Knowledge Graph's whole-database view; it is a study tool for one topic at a time.

## Settings

In RemNote, **Settings > Plugin Settings > Bubble Map**: turn outline lines, link lines or tag lines on or off, and set the most bubbles to draw (lower is faster).

## Credits

Original code, MIT license. Drawing uses the open-source d3 libraries (ISC license).
