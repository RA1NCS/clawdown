<p align="center">
  <img src="assets/clawd.svg" alt="Clawd" width="80">
</p>
<p align="center"><i>clawd has opinions about your formatting.</i></p>

# clawdown

a markdown editor where a pixel cat lives in the margins of your PDFs and silently judges your bullet points.

> **[clawdown.app](https://clawdown.app)**

---

your words never leave your browser. no server, no account, no nonsense. just you, your markdown, and a judgmental pixel cat.

---

**what you get**

- write markdown, get a beautiful styled PDF instantly
- real code editor with syntax highlighting and shortcuts
- resizable split pane, autosave, drag-and-drop import
- multi-page layout with page numbers
- works on mobile
- clawd peeking from every page border (toggleable. but why would you.)

---

**for the ambitious ones**

REST API and MCP server for programmatic access. same styled output, same judgmental cat.

```bash
# convert markdown to PDF
curl -X POST https://api.clawdown.app/convert \
  -H "Content-Type: application/json" \
  -d '{"markdown": "# hello clawd", "clawds": true}' \
  -o output.pdf
```

**MCP server** — let your AI talk to clawd directly. no auth, no setup fuss.

```bash
# claude code
claude mcp add --transport http clawdown https://mcp.clawdown.app
```

<details>
<summary>other editors</summary>

**Cursor** — add to `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "clawdown": {
      "url": "https://mcp.clawdown.app"
    }
  }
}
```

**Windsurf** — add to `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "clawdown": {
      "serverUrl": "https://mcp.clawdown.app"
    }
  }
}
```

**VS Code Copilot** — add to `.vscode/mcp.json`:
```json
{
  "servers": {
    "clawdown": {
      "type": "http",
      "url": "https://mcp.clawdown.app"
    }
  }
}
```

</details>

**MCP tools**

| tool | description |
|------|-------------|
| `convert_markdown` | markdown → short download URL + page count + file size. optional `clawds` toggle. |

**REST endpoints** — `api.clawdown.app`

| method | path | description |
|--------|------|-------------|
| `POST` | `/convert` | `{ "markdown": "...", "clawds": true, "filename": "doc" }` → PDF |
| `GET` | `/d/:id` | download a generated PDF by id |
| `GET` | `/health` | `{ "status": "ok" }` |

---

**clawd approves of feedback**

> [leave feedback](https://app.youform.com/forms/wvdaxjhc)

---

**keep clawd fed**

clawd mass-produces PDFs for free. he asks for nothing in return. but he does get hungry.

<a href="https://ko-fi.com/gshreyan">
  <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="buy clawd a snack on ko-fi">
</a>

---

MIT · clawd was here
