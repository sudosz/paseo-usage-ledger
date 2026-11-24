# Usage Ledger

Token, cache, and API-equivalent cost analytics for Paseo agents, across OpenCode, Claude Code, Codex, and Bifrost lanes.

Open **Usage Ledger** from the sidebar footer. The footer line shows 24h processed tokens, a cache meter, and estimated cost; click it for a compact breakdown. The full screen adds the range switch, composition, chart, harness cards, and a model table with inline drilldown.

## What it shows

- 24h / 7d / 30d / 90d
- Processed, cached input, uncached input, cache write, and output tokens
- Cache hit rate and cache savings in API-equivalent dollars
- Cost per harness and per session
- Per-model tokens, cache hit rate, share, blended $/1M, and cost
- **Unpriced** instead of `$0` for models without a published rate
- Stacked harness curve or bars, with metric and view controls inside the chart card
- Hover or drag readout; the tooltip lists every harness and the bucket total
- Expandable "About these numbers" notes

## Sources

- **OpenCode:** session rows in `~/.local/share/opencode/opencode.db` — tokens, cache, model, reported cost.
- **Claude Code:** usage records in `~/.claude/projects/**/*.jsonl`.
- **Codex:** `token_usage_record` events in `~/.codex/sessions/**/*.jsonl`.
- **Bifrost:** optional aggregate lane snapshot at `~/.paseo/usage/bifrost.json`. Bifrost's config database is never exposed to the Paseo container.

Install the Bifrost exporter on the host if lane attribution is wanted:

```bash
sudo install -m 755 tools/bifrost-usage-export.py /usr/local/bin/
sudo crontab -e   # */5 * * * * /usr/local/bin/bifrost-usage-export.py
```

## Cost model

Reported OpenCode costs are used when present. Claude and Codex costs are estimated from a bundled rate table; unknown models stay unpriced. Cache savings are gross: `cacheRead × (inputRate − cacheReadRate)`, so they can exceed total cost. These are API-equivalent estimates, not a subscription bill.

## Lightweight by design

- No scheduled jobs and no per-token updates.
- Screen scans run on open, refresh or focus; summaries cache for 60 seconds with in-flight deduplication.
- The always-mounted footer checks a cached 24h rollup every two minutes, and a finished turn invalidates the server cache.
- JSONL files are parsed once per mtime/size and cached in memory.
- OpenCode reads only the `session` table, not the 3+ GiB database.
- SQLite handles are opened read-only and closed after each query.
- The footer reuses the 24h query cache; it does not start a second scanner.
- No `ccusage` binary and no shell process per refresh.

## Development

```bash
npm ci
npm run lint        # oxlint
npm run typecheck
npm test            # parsers, aggregation, pricing, formatting, chart scale
npm run bench -- --assert
```

The benchmark parses 20k Claude and 20k Codex records, aggregates 200k events, summarizes 30 days, and asserts throughput and heap-growth floors. CI runs lint, typecheck, tests, and the asserted benchmark on Node 22.

## Limits

- A session is counted in the window of its updated timestamp, so a session spanning a boundary is not split.
- Bifrost retention is short; attribution is best-effort.
- Pricing lives in `server/pricing.ts`.
