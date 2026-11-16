# Why Loop

A RemNote plugin that walks you through studying a lecture so that you learn the reasons, not just the names.

It adds a **Why Loop** tab to the right sidebar with three parts.

## Lectures (the guide)

Open the lecture's page, type the course, and press **Start**. The guide shows one step at a time, with what to do, how long it should take, and a worked example.

1. **Sort.** Is there a reason behind this topic, or do I just memorize it?
2. **Questions.** Turn the learning objectives into how and why questions. Type them in and press **Add to my page**: each one is added to your notes with four fixed questions under it (for a thing, a process or a calculation).
3. **Pretest.** A few practice questions cold.
4. **Map.** Twenty minutes, sources open, answers in your own words. A timer is built in. Write `??` where the source gives no reason.
5. **Cards.** Ten to fifteen. At least half blank the reason or what happens next.
6. **Quick test.** Say "I think it is X because Y" before looking at the choices.
7. **Miss log.** Log wrong reasoning only.

## Miss log

Each miss comes back for a re-test one week later, with a fresh question on the same idea.

## Weekly

Lists the lectures due for a redraw from memory, shows how many misses are due, and saves your weekly number (first-try accuracy on a mixed question set) for each course, with a small trend chart.

## About the method

The pieces come from learning research: practice testing and spacing have the strongest support, and asking "why" has moderate support (Dunlosky et al., 2013; Roediger and Karpicke, 2006). The way the steps are packaged here is the author's own and has not been tested as a whole. Use your weekly number to judge whether it works for you.

Everything is saved to your RemNote account, so it syncs between devices. It pairs well with the Bubble Map plugin but does not need it.

## Development

```
npm install
npm run dev   # serves on http://localhost:8081
npm run build # makes PluginZip.zip
```
