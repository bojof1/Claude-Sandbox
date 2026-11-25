# Toolbox

Tools for learning, productivity and organization, sorted by folder. A weekly scout adds new finds to `tools.json` and rebuilds this page.

Last updated 2026-11-25.

Run `./pull.sh` to clone everything into `~/Toolbox/<folder>/`. Re-running it updates existing clones.

## RemNote  (`remnote/`)

| Repo | Why it's here |
|---|---|
| [remnoteio/remnote-official-plugins](https://github.com/remnoteio/remnote-official-plugins) | RemNote's own plugins. Best reference for how Why Loop, Bubble Map and Feynman Coach should be structured before they go public. |
| [remnoteio/remnote-plugin-template-react](https://github.com/remnoteio/remnote-plugin-template-react) | Official starter template. Diff your plugins against it to catch drift in build config and manifest. |
| [browneyedsoul/remnote-plugins](https://github.com/browneyedsoul/remnote-plugins) | Community plugin pack. Active Recall in Editor and Callout are the two worth trying for Why Loop pages. |
| [hannesfrank/awesome-remnote](https://github.com/hannesfrank/awesome-remnote) | Running index of RemNote plugins, themes and CSS. Check here first before building something new. |
| [bjsi/incremental-everything](https://github.com/bjsi/incremental-everything) | Mixes lab papers, notes and video clips into your RemNote review queue in small pieces, so Priolo lab reading gets done alongside your cards. |
| [melvinmng/remnote-flashcard-notes](https://github.com/melvinmng/remnote-flashcard-notes) | Shows a notes field under each flashcard during review, a natural spot for your Why Loop reasoning. Brand new with one developer, so treat it as a trial. |

## Spaced repetition  (`spaced-repetition/`)

| Repo | Why it's here |
|---|---|
| [open-spaced-repetition/awesome-fsrs](https://github.com/open-spaced-repetition/awesome-fsrs) | Index of everything built on FSRS, the scheduler RemNote uses. |
| [open-spaced-repetition/ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | FSRS in TypeScript. Drop-in scheduler if Why Loop or Pattern Academy ever needs its own review timing. |
| [open-spaced-repetition/fsrs-optimizer](https://github.com/open-spaced-repetition/fsrs-optimizer) | Fits FSRS parameters to your real review history. Use once you have a few months of Why Loop cards. |
| [JuliusBrussee/revu-swift](https://github.com/JuliusBrussee/revu-swift) | Open source local-first macOS flashcard app on FSRS. Reference build for MCAT Pattern Academy. |

## Claude skills  (`claude-skills/`)

| Repo | Why it's here |
|---|---|
| [anthropics/skills](https://github.com/anthropics/skills) | Anthropic's official skills. The source of truth for how a skill should be written. |
| [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) | Curated skill list with a Skills vs MCP explainer. |
| [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | Largest curated skill list, grouped by category. |
| [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | Skills, hooks, slash commands and plugins for Claude Code. |
| [Imbad0202/academic-research-skills](https://github.com/Imbad0202/academic-research-skills) | Skills that walk a paper from research to draft to peer-style review and revision. Useful for your MAMS thesis and lab write-ups. |

## MCP servers  (`mcp-servers/`)

| Repo | Why it's here |
|---|---|
| [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | Official MCP server collection. Filesystem, git, fetch and more. |
| [54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp) | Connects a Zotero library to Claude with semantic search and PDF annotations. Fits Priolo lab reading and thesis citations. |
| [robert7/remnote-mcp-server](https://github.com/robert7/remnote-mcp-server) | Lets Claude search, read and write your RemNote knowledge base, so skills like Why Loop and Feynman Coach can work straight from your real notes. |

## Diagrams  (`diagrams/`)

| Repo | Why it's here |
|---|---|
| [excalidraw/excalidraw-mcp](https://github.com/excalidraw/excalidraw-mcp) | Official Excalidraw MCP. Already connected in Claude, so this is here for reference. |
| [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw) | Persistent live canvas Claude can edit across turns. Upgrade path if one-shot diagrams aren't enough. |
| [jgraph/drawio-mcp](https://github.com/jgraph/drawio-mcp) | Official draw.io server that lets Claude build editable pathway and mechanism diagrams you can keep tweaking by hand. |

## DeepSeek Harness  (`deepseek-harness/`)

| Repo | Why it's here |
|---|---|
| [coeasy/dsh-go](https://github.com/coeasy/dsh-go) | Package manager and plugin directory for DeepSeek Harness. Very new with few users, so use it to browse DSH plugins, not to install them yet. |
