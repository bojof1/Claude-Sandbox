# Two RemNote plugins by Bolurin

This repository holds the full source for three separate RemNote plugins. Each one has its own folder, manifest, README and build steps.

| Plugin | Folder | Plugin id | Version |
| --- | --- | --- | --- |
| **Bubble Map** | [`remnote-graph-view/`](remnote-graph-view/) | `bolurin_graph_view` | 1.1.0 |
| **Why Loop** | [`why-loop-plugin/`](why-loop-plugin/) | `bolurin_why_loop` | 1.1.0 |
| **Feynman Coach** | [`feynman-plugin/`](feynman-plugin/) | `bolurin_feynman` | 1.0.0 |

- Manifests: `remnote-graph-view/public/manifest.json`, `why-loop-plugin/public/manifest.json` and `feynman-plugin/public/manifest.json`
- Source: each folder's `src/` (widgets in `src/widgets/`, logic in `src/lib/`)
- Build steps: the "Build it yourself" section of each plugin's README

## Build either plugin

You need Node.js (LTS, version in `.nvmrc`).

```
cd remnote-graph-view   # or: cd why-loop-plugin, cd feynman-plugin
npm ci
npm run build           # makes PluginZip.zip from dist/
```

The `PluginZip.zip` that this makes is the file uploaded to the RemNote marketplace.

All three plugins are MIT licensed.
