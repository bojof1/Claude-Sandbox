# Feynman Coach

A RemNote plugin for learning an idea until you can teach it. It works on any page of notes.

1. Open a page, or click into one line and choose **This line**. The coach reads the notes under it and finds the main points and details. They stay hidden.
2. Explain the idea from memory, in plain words, as if teaching someone new. Say how sure you are, and tick only the self-checks that are true.
3. Tap **Check it**. You get a score out of 100, built from your own notes:
   - **Covered your notes**: which points came up, matched by their key words
   - **Gave reasons**: "because" links and cause-and-effect steps
   - **Plain words**: big words used without a plain meaning, hand-waving words like "somehow", reading level, and, for a process, steps told out of order
   - **Your own checks**
4. The **Gaps** list shows the exact notes you missed or only partly said. **Fill the gaps** starts a short round on just those parts.
5. Pass a level to move up the ladder. Score under 50 and you drop one level.

| Level | Name | You are asked to | Pass |
| --- | --- | --- | --- |
| 1 | Simple | Explain it to a 12-year-old (main points) | 70 |
| 2 | Why | Give the reason behind every step (main points and details, extra care on your weakest points) | 75 |
| 3 | What if | Say what happens when one part breaks (the part you miss most) | 70 |
| 4 | Connect | Link it to a tagged, linked or parent idea, and name it | 70 |
| 5 | Teach cold | Teach every detail from a blank page | 85 |

**Mastered** means two Level 5 passes at least 3 days apart.

The check matches key words, so it can miss a point said in other words. Tap **I said this differently** when that happens. **Copy for Claude** copies your notes, your explanation and the check, ready to paste into a chat for a deeper review. **+ Queue** adds one card under the page so RemNote's own schedule brings the idea back. The plugin has no scheduler of its own; the "come back" date is only a hint.

Your scores are saved in your RemNote account (synced storage key `fc-data`). A half-written explanation is kept on the device (`fc-draft`) if the sidebar closes.

## Build it yourself

```
npm ci
npm run build   # makes PluginZip.zip from dist/
npm test        # checker and stress tests
```
