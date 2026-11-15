# Graph View for RemNote

An Obsidian-style graph for RemNote. Every Rem is a dot. Lines show which Rems are linked.

- **Gray lines** are parent and child (the outline).
- **Purple lines** are references (`[[links]]`).
- **Click a dot** to open that Rem. Drag dots to move them. Scroll to zoom.
- **This page** shows the Rems around the page you have open. **Everything** shows your whole knowledge base (the most connected Rems first).
- **Find** lights up dots that match what you type.

## How to open it in RemNote

- Press **Cmd + Shift + G**, or type `/Open Graph View`, to open the big graph.
- Or open the right sidebar and pick the **Graph** tab. It follows the page you are on.

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

In RemNote, **Settings > Plugins > Graph View**: turn parent-child lines or reference lines on or off, and set the most dots to draw (lower is faster).
