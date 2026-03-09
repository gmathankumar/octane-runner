# octane-runner

CLI tool to link ALM Octane tests to a work item — driven by a **git commit hash** (extracts changed test names automatically) or a **CSV file** of test names.

No Postman required. Pure Node.js, zero runtime dependencies for the core flow.

---

## Installation

```bash
npm install -g octane-runner
```

Or use without installing:

```bash
npx octane-runner --commit abc1234 --session session.json --config config.json
```

---

## Setup

You need two files. One is committed to git; the other is a secret you refresh when your session expires.

### `config.json` — commit this to git

Copy your Octane workspace URL and work item ID here once. Never needs to change unless you switch workspaces.

```json
{
  "searchUrl": "https://almoctane-eur.saas.microfocus.com/api/shared_spaces/146003/workspaces/1002/tests?fields=creation_time,id,phase,name,subtype,author%7Bfull_name%7D,owner%7Bfull_name%7D&limit=100&offset=0&order_by=name,id&query=%22(subtype+IN+%27gherkin_test%27,%27test_manual%27,%27test_automated%27)%22",
  "updateUrl": "https://almoctane-eur.saas.microfocus.com/api/shared_spaces/146003/workspaces/1002/tests",
  "workItemId": "1809072",
  "octaneClientVersion": "26.2.8.91",
  "testNameRegex": "^\\+.*\\b(test_[a-zA-Z0-9_]+)\\s*\\("
}
```

> **Tip:** The `searchUrl` can be copied directly from any existing search request in DevTools — it contains all the right query filters. Only the `text_search` param is replaced per test name at runtime.

`octaneClientVersion` controls the `octane-client-version` request header. Set it to match the version expected by your Octane environment.

---

### `session.json` — **never commit this**

Add `session.json` to your `.gitignore`. Refresh it when your Octane session expires (typically after ~8 hours of inactivity).

```json
{
  "cookie":      "<paste full cookie string here>",
  "xsrf-header": "<paste xsrf token here>",
  "ptal":        "<paste ptal value here>"
}
```

#### How to grab the values from Chrome DevTools

1. Open Octane in Chrome and log in: `https://almoctane-eur.saas.microfocus.com`
2. Open DevTools: **F12** (or `Cmd+Option+I` on Mac)
3. Go to the **Network** tab
4. Click any request to the Octane API (any `.../tests` or `.../workspaces/...` request)
5. Right-click the request → **Copy → Copy as cURL (bash)**
6. Paste into a text editor — you'll see:

```bash
curl 'https://almoctane-eur.saas.microfocus.com/api/...' \
  -b 'hpSaasFederationIdpId=hastingsdirect.com#...; LWSSO_COOKIE_KEY=...; JSESSIONID=...' \
  -H 'xsrf-header: 1j4kk0dts46g67fors9upejeh7' \
  -H 'ptal: 98a73bcfae1cf3d57ba6e0079d62a396' \
  ...
```

Extract the three values:

| Field in `session.json` | Where to find it in the curl |
|---|---|
| `cookie` | The `-b '...'` string (everything between the single quotes) |
| `xsrf-header` | The `-H 'xsrf-header: ...'` value |
| `ptal` | The `-H 'ptal: ...'` value |

Paste them into `session.json` and save. Done.

---

## Usage

### Link tests from a git commit (recommended)

Runs `git show <hash> --patch` in the current directory, extracts test names using `config.testNameRegex` (or a built-in default for `test_*` methods), then searches and links each one in Octane.

```bash
# Run from inside your Java/Spring repo
cd /path/to/your/repo

octane-runner \
  --commit abc1234 \
  --session /path/to/session.json \
  --config  /path/to/config.json
```

**Full commit hash or short hash both work:**

```bash
octane-runner --commit abc1234def
octane-runner --commit abc1234
```

### Link tests from a CSV

If you have a list of test names already, skip the git step:

```bash
octane-runner \
  --data    tests.csv \
  --session session.json \
  --config  config.json
```

CSV format — one `testName` per row:

```csv
testName
test_validateLastName_surnameProvided_returnsSuccess
test_validateFirstName_nameProvided_returnsSuccess
test_processPayment_validCard_returnsSuccess
```

### All options

```
--commit <hash>    Git commit hash. Runs git show in CWD.
--data   <file>    CSV with a testName column (alternative to --commit)
--session <file>   Path to session.json  [default: session.json]
--config  <file>   Path to config.json   [default: config.json]
--delay  <ms>      Milliseconds between requests  [default: 300]
--dry-run          Show what would happen without firing any requests
--help             Show help
```

### Dry run first

Always a good idea on a large commit:

```bash
octane-runner --commit abc1234 --session session.json --config config.json --dry-run
```

Output will show every test name found in the diff and the PUT body that would be sent, without touching Octane.

---

## How it works

```
git show <hash> --patch
        │
        ▼ (written to OS temp file, deleted after)
  commit.patch
        │
        ▼ (regex: config.testNameRegex || /^\+.*\b(test_[a-zA-Z0-9_]+)\s*\(/gm)
  [ "test_validateLastName_...", "test_processPayment_...", ... ]
        │
        ▼ for each test name:
  GET /tests?text_search={"type":"context","text":"<testName>"}
        │
        ├─ total_count == 0 → WARN "not found", continue
        │
        └─ found → testId = data[0].id
                        │
                        ▼
              PUT /tests  body: { data: [{ covered_content: { data: [{ type: "work_item", id: "<workItemId>", op_code: "add" }] }, id: "<testId>" }] }
```

`x-correlation-id` is generated as a fresh UUID per request (same as the browser does).  
`xsrf-header` and `cookie` come from `session.json`.

---

## Session expired mid-run?

The runner will stop immediately on a `401` and print:

```
ERROR  401 Unauthorized — session has expired. Update session.json and retry.
```

Refresh `session.json` (see above) and re-run. Tests that were already updated won't be double-linked — Octane's `op_code: "add"` is idempotent for existing links.

---