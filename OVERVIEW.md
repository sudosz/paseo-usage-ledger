# Usage Ledger

Token, cache, and API-equivalent cost analytics for Paseo agents.

## Surface

- **Sidebar footer:** 24h tokens, cache meter, cost, and a popover with the harness split.
- **Usage Ledger screen:** hero, range switch, composition meter, four token cards, stacked harness chart, harness cards, model table, and cost-assumption notes.

Controls:

- Range: 24h, 7d, 30d, 90d.
- Chart metric: processed tokens, cached input, cost.
- Chart view: smooth stacked curve or stacked bars.
- Model rows expand for blended $/1M and the full token split.

## Sources

- **OpenCode:** session rows in `~/.local/share/opencode/opencode.db`; input, output, cache read, cache write, model and reported cost.
- **Claude Code:** assistant usage records in `~/.claude/projects/**/*.jsonl`; cache creation/read and message/session ids.
- **Codex:** `token_usage_record` events in `~/.codex/sessions/**/*.jsonl`; thread settings supply the model/provider.
- **Bifrost:** when `/opt/bifrost/data/logs.db` is mounted, the busiest lane per OpenCode session supplies the real provider/model. In production the host exporter writes only aggregate session/lane rows to `~/.paseo/usage/bifrost.json`; Bifrost's config DB stays private.

## Metrics

- `processed = uncached input + cache read + cache write + output`
- `cache hit rate = cache read / (uncached input + cache read + cache write)`
- Cache writes count as misses.
- `cache savings = cache read × (input rate − cache read rate)` for priced models.
- Cost uses the reported log cost when present; otherwise the bundled rate table.
- A model with no reported cost and no bundled rate is **Unpriced** and excluded from cost, never plotted as free.

## Architecture

- `server/parse.ts` — pure Claude/Codex line parsers.
- `server/aggregate.ts` — one-pass event aggregation, per-bucket totals, per-harness series, model rows.
- `server/ledger.ts` — filesystem/SQLite sources, mtime+size JSONL cache, 60s summary cache, single-flight refresh.
- `client/flow-chart.tsx` — stacked area/bars drawn with Views because plugins cannot load SVG.
- `client/sidebar.tsx` — ccusage-style footer and popover.
- `shared/contracts.ts` — zod RPC contract; `ledger.summary` takes `{ range, refresh? }`.

## Cost of a refresh

- The 24h query scans only recent Claude/Codex files by mtime and the OpenCode session table.
- JSONL parses are cached per file by mtime + size.
- Repeated scans within 60 seconds return the cached summary.
- Concurrent requests for one range share a single in-flight scan.
- The chart is pure client-side; changing metric or curve/bars never refetches.

## Verification

- `npm run lint` — oxlint over client, server, shared, tests, and bench.
- `npm run typecheck` — strict TypeScript.
- `npm test` — parsers, aggregation, pricing, formatting, chart scale.
- `npm run bench -- --assert` — parse throughput, 200k-event aggregation, summary time, heap growth.
- GitHub Actions runs all four on Node 22.
