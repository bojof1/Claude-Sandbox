# Changelog

## 1.2.1 (2026-11-25)

- Asks RemNote for read, create and modify only. It never deleted Rems, so the delete permission is gone.
- Remove asks once more before deleting a lecture.
- A blank or non-whole-number score is no longer saved as 0. It asks for both numbers instead.
- Teach it saves when you stop typing (or leave the box), not on every key.
- Typed questions, scores and messages clear when you open a different lecture, and the map timer only shows on the lecture it was started for.

## 1.2.0 source rebuild (2026-11-25)

The original source for 1.2.0 was lost; only the built plugin survived. This is the source rebuilt from that build. Behavior, wording, and saved data are the same as the 1.2.0 plugin in use. Added: tests for loading and merging saved data, a README, and this changelog.
