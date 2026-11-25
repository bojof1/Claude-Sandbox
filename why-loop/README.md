# Why Loop

A RemNote plugin that walks you through studying one lecture with the Why Loop method, keeps a log of reasoning mistakes with one-week re-tests, and tracks one weekly number per course.

It opens as a **Why Loop** tab in the right sidebar.

## What it does

- **Today.** One "do this now" card: re-tests that are due, the next step for lectures from the last two days, late lectures, maps due for a redraw, and the weekly review on your chosen day. Add exam dates and it tells you which course gets the full loop and which gets cards only.
- **Lectures.** Seven steps, one at a time: Sort, Questions, Pretest, Map (with a 20 minute timer), Cards, Quick test (with a Teach it box), and Miss log. The Questions step can write your how and why questions into the lecture's page, each with its fixed sub-questions under it.
- **Miss log.** Wrong reasoning only. Each miss comes back a week later. Got it closes it; Still wrong pushes it another week.
- **Weekly.** Exam dates, your review day, maps to redraw from memory, and the weekly first-try accuracy per course as a small bar chart.

Everything is saved in RemNote synced storage (key `wl-data`), so it follows you between devices. Saves are merged, so a change on one device does not erase a change made on another.

## Run it

Needs Node 18 or newer.

```
npm install
npm run dev
```

Then in RemNote: Settings, Plugins, Build, **Develop from localhost**, and enter `http://localhost:8080`.

## Build

```
npm run build
```

This makes `PluginZip.zip`. Note that **Upload plugin** in RemNote submits a plugin to the public marketplace; it is not a private install.

## Check

```
npm run check-types
npm test
```

## Files

- `src/WhyLoop.tsx` the panel
- `src/lib/steps.ts` the seven steps, the question sets, and the Teach it checks
- `src/lib/data.ts` the saved data, reading it safely, and merging saves
- `src/lib/rem.ts` small helpers that write to your RemNote pages
- `src/widgets/` plugin entry points
- `public/manifest.json` plugin id, name, version, and permissions

## License

MIT
