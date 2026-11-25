import json, pathlib
here = pathlib.Path(__file__).parent
d = json.load(open(here / "tools.json"))
titles = {"remnote": "RemNote", "spaced-repetition": "Spaced repetition", "claude-skills": "Claude skills",
          "mcp-servers": "MCP servers", "diagrams": "Diagrams"}
out = ["# Toolbox", "",
       "Tools for learning, productivity and organization, sorted by folder. "
       "A weekly scout adds new finds to `tools.json` and rebuilds this page.", "",
       f"Last updated {d['updated']}.", "",
       "Run `./pull.sh` to clone everything into `~/Toolbox/<folder>/`. Re-running it updates existing clones.", ""]
for folder, items in d["folders"].items():
    out += [f"## {titles.get(folder, folder)}  (`{folder}/`)", "", "| Repo | Why it's here |", "|---|---|"]
    out += [f"| [{i['repo']}](https://github.com/{i['repo']}) | {i['why']} |" for i in items]
    out.append("")
(here / "README.md").write_text("\n".join(out))
