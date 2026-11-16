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

- **Redraw from memory.** The names hide. Click a bubble, say what it is (with the reason), press Reveal, then mark Got it or Missed it. You get a score, missed bubbles turn orange, and the score is saved per page so the map can remind you to redraw after a week. Recalling a map from memory is retrieval practice, which is one of the best-supported study methods.
- **Card check.** Counts the flashcards on the map and guesses which ask for a reason and which only ask for a name (answers of one or two words). Aim for at least half reason cards, and 10 to 15 cards per lecture.
- **Open questions.** Any bullet with `??` in it is listed, so you can take the list to office hours.
- **Add card / Questions.** From a bubble's card, add a why or what-if flashcard, or add a fixed set of questions for a thing, a process or a calculation.
- **Card progress colors**, **fold**, **save picture**, and the map remembers how you arranged each page.

## Load it on your Mac (local dev plugin)

You need [Node.js](https://nodejs.org) (the LTS version) installed once.

1. Download this folder (`remnote-graph-view`) to your Mac.
2. Open the Terminal app and go to the folder: `cd path/to/remnote-graph-view`
3. Run `npm install` (only the first time).
4. Run `npm run dev` and leave that Terminal window open.
5. In RemNote, go to **Settings > Plugins > Build > Develop from localhost**.
6. Type `http://localhost:8080` and click **Develop**.

The plugin stays loaded while `npm run dev` is running. Next time, just do steps 2 and 4.

## Settings

In RemNote, **Settings > Plugin Settings > Bubble Map**: turn outline lines, link lines or tag lines on or off, and set the most bubbles to draw (lower is faster).

## Credits

Original code, MIT license. Drawing uses the open-source d3 libraries (ISC license).
