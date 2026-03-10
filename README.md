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
npx octane-runner --commit abc1234 --curl request.curl --config config.json
```

---

## Setup

You need one required config file and one copied cURL file for auth.

### `config.json` — commit this to git

Copy your Octane workspace URLs and work item ID here once. Never needs to change unless you switch workspaces.

```json
{
  "searchUrl": "https://almoctane-eur.saas.microfocus.com/api/shared_spaces/146003/workspaces/1002/tests?fields=creation_time,id,phase,name,subtype,author%7Bfull_name%7D,owner%7Bfull_name%7D&limit=100&offset=0&order_by=name,id&query=%22(subtype+IN+%27gherkin_test%27,%27test_manual%27,%27test_automated%27)%22",
  "updateUrl": "https://almoctane-eur.saas.microfocus.com/api/shared_spaces/146003/workspaces/1002/tests",
  "workItemId": "1809072",
  "testNameRegex": "^\\+.*\\b(test_[a-zA-Z0-9_]+)\\s*\\("
}
```

> **Tip:** The `searchUrl` can be copied directly from any existing search request in DevTools — it contains all the right query filters. Only the `text_search` param is replaced per test name at runtime.

---

### `request.curl` — recommended auth source

Copy a request from DevTools as cURL and save it to a file, for example `request.curl`.

The runner reads `cookie`, `xsrf-header`, `ptal`, and `octane-client-version` directly from this file at runtime.

#### How to grab the cURL from Chrome DevTools

1. Open Octane in Chrome and log in: `https://almoctane-eur.saas.microfocus.com`
2. Open DevTools: **F12** (or `Cmd+Option+I` on Mac)
3. Go to the **Network** tab
4. Click any request to the Octane API (any `.../tests` or `.../workspaces/...` request)
5. Right-click the request → **Copy → Copy as cURL (bash)**
6. Paste into `request.curl`

Run with:

```bash
octane-runner --commit abc1234 --curl request.curl --config config.json
```

---

## Usage

### Link tests from a git commit (recommended)

Runs `git show <hash> --patch` in the current directory, extracts test names using `config.testNameRegex` (or a built-in default for `test_*` methods), then searches and links each one in Octane.

```bash
# Run from inside your Java/Spring repo
cd /path/to/your/repo

octane-runner \
  --commit abc1234 \
  --curl /path/to/request.curl \
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
  --curl request.curl \
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
--curl <file>              Read auth directly from copied cURL (recommended)
--commit <hash>            Git commit hash. Runs git show in CWD.
--data   <file>            CSV with a testName column (alternative to --commit)
--config  <file>           Path to config.json   [default: config.json]
--delay  <ms>              Milliseconds between requests  [default: 300]
--dry-run                  Show what would happen without firing any requests
--help                     Show help
```

### Dry run first

Always a good idea on a large commit:

```bash
octane-runner --commit abc1234 --curl request.curl --config config.json --dry-run
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
`xsrf-header`, `cookie`, and `octane-client-version` come from the cURL file (`--curl`).

---

## Session expired mid-run?

The runner will stop immediately on a `401` and print:

```
ERROR  401 Unauthorized — authentication has expired. Refresh cURL input and retry.
```

Refresh your auth input (new copied cURL) and re-run. Tests that were already updated won't be double-linked — Octane's `op_code: "add"` is idempotent for existing links.

---