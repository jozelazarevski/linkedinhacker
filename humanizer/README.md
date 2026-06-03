# Humanizer

Train on your **own** writing, then rewrite or generate anything so it sounds
like *you* — not a generic AI. A small, self-contained Python platform built on
the Anthropic Claude API.

> Why this exists: people hate AI-sounding content. Humanizer learns your actual
> voice from samples you provide and uses it as the model's reference on every
> request, while actively stripping the usual "AI tells."

## How it works

```
your writing ──train──▶ samples (SQLite)
                           │
                        analyze ──▶ style guide (distilled by Claude)
                           │
   ┌───────────────────────┴───────────────────────┐
   ▼                                                ▼
voice context  =  style guide  +  your samples   (cached system prompt)
   │
   ├─ rewrite   "say this, but in my voice"
   ├─ humanize  "strip the AI tells, make it mine"
   └─ write     "draft this from a brief, in my voice"
```

Two design choices make it good and cheap:

1. **Voice as a cached prefix.** The style guide + your sample corpus are the big,
   reused part of every prompt. They go in a **byte-stable system prompt** with a
   `cache_control` breakpoint, so they're written to Anthropic's prompt cache once
   and read at ~0.1× cost on every subsequent call. The per-request text goes
   *after* the breakpoint, so it never invalidates the cache.
2. **Targeted few-shot via retrieval.** For each task, a lightweight TF-IDF index
   (pure stdlib, no heavy deps) finds the few of *your* samples most relevant to
   the job and adds them as references — after the cached prefix.

Model: defaults to **`claude-opus-4-8`** (most capable). Set
`HUMANIZER_MODEL=claude-sonnet-4-6` for faster/cheaper bulk rewriting.

## Install

```bash
cd humanizer
python -m venv .venv && source .venv/bin/activate
pip install -e .            # or: pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...   # or put it in humanizer/.env
```

## Use

```bash
# 1. Teach it your voice — a file, a folder of .txt/.md, stdin, or literal text.
humanizer train ./my_posts/                       # a directory of writing
humanizer train ./essay.md
cat post.txt | humanizer train -                  # from stdin
humanizer train "Paste a post here." --split      # --split breaks on '---' / blank lines

# 2. Distill a style guide (uses Claude; reused on every later call).
humanizer analyze

# 3. Use your voice.
humanizer rewrite "We are excited to announce our new feature." 
echo "draft text" | humanizer rewrite -
humanizer humanize ./ai_written_draft.txt          # strip AI tells + match you
humanizer write "a short post about why we killed our biggest feature"

# Inspect / manage
humanizer profile
humanizer profiles
humanizer rewrite "..." -v        # -v prints token + cache usage
```

### Augmentation level

`rewrite`, `humanize`, and `write` take `-l/--level` to control how aggressively
the text is transformed:

| Level | What it does |
|---|---|
| `light` | Minimal touch — fix only clear AI tells and tonal mismatches; keep structure & wording |
| `medium` *(default)* | Natural rewrite in your voice; keep structure and key points |
| `heavy` | Full rewrite — restructure freely for authenticity, preserving meaning |

All levels **preserve sophistication** — humanizing never means dumbing down; the
output matches your own level of nuance and technical precision.

```bash
humanizer humanize ./draft.txt --level heavy
humanizer rewrite "..." --level light
```

### See what changed (`--diff`)

`rewrite` and `humanize` accept `-d/--diff` to print a word-level before/after
and a list of the specific AI tells that were removed (and em-dashes, length):

```bash
humanizer humanize "In today's fast-paced world we leverage cutting-edge tools…" --diff
```
```
── changes ──
[-In today's fast-paced world we leverage cutting-edge-]{+we use plain+} tools…
AI tells removed:
  • "in today's fast-paced world"
  • "leverage" (verb)
  • "cutting-edge"
length: 12 → 6 words (-6)
```
The rewritten text goes to **stdout** (pipe-friendly); the diff goes to **stderr**,
so `humanizer humanize x --diff > out.txt` still writes a clean result. Use
`--no-color` for plain `[-removed-]`/`{+added+}` markers instead of ANSI color.

### Multiple voices

Everything takes `--profile <name>`, so you can keep separate voices (e.g. your
personal voice vs. a brand voice):

```bash
humanizer --profile brand train ./brand_posts/
humanizer --profile brand analyze
humanizer --profile brand write "announce the Q3 roadmap"
```

## Verifying the cache is working

Run a rewrite twice with `-v`. The first call shows `cache_write=<N>`; the second
shows `cache_read=<N>` (and `cache_write=0`) — that's the voice context being
served from cache at a fraction of the cost.

## Storage & privacy

Your samples and style guides live in a local SQLite file
(`~/.humanizer/humanizer.db`, override with `HUMANIZER_DB`). Nothing is uploaded
except the prompt content sent to the Anthropic API at call time.

## Tests

Offline tests (store, ingest, retrieval, prompt assembly — no API key needed):

```bash
python -m pytest tests/ -q        # or: python tests/test_offline.py
```

## Layout

```
humanizer/
  config.py      model + DB location + .env loading
  store.py       SQLite: profiles + samples
  ingest.py      load samples from files / dirs / text
  retrieval.py   pure-stdlib TF-IDF relevance ranking
  engine.py      Claude calls + prompt-caching strategy
  cli.py         the `humanizer` command
```
