# Usage Ledger

Token, cache, and API-equivalent cost analytics for Paseo agents.

## Sources

- **OpenCode:** session rows in `~/.local/share/opencode/opencode.db`; input, output, cache read, cache write, model and reported cost.
- **Claude Code:** assistant usage records in `~/.claude/projects/**/*.jsonl`.
- **Codex:** `token_usage_record` events in `~/.codex/sessions/**/*.jsonl`.
- **Bifrost:** when `/opt/bifrost/data/logs.db` is mounted, the busiest lane per OpenCode session supplies the real provider/model. Without it, OpenCode's provider/model metadata is used.

## What it shows

- 24h / 7d / 30d / 90d
- Processed tokens (input + cache read + cache write + output)
- Cached input, uncached input, output, cache write
- Cache savings in API-equivalent dollars
- Per-harness cards
- Per-model tokens, cost and share; unknown models are labelled **Unpriced**
- Daily or hourly chart with cached and uncached segments

## Cost

Reported OpenCode costs are used when present. Claude/Codex costs are estimated from a small bundled rate table; unknown models are never assigned a made-up price. Cache savings are input-rate minus cache-read-rate times cache-read tokens, for priced models only. These are API-equivalent estimates, not subscription bills.

## Lightweight by design

- No background polling and no scheduled jobs.
- Results are cached for 60 seconds; the refresh button bypasses the cache.
- JSONL files are parsed once per mtime/size and cached in the plugin process.
- OpenCode reads only the session table, not the full database.
- Bifrost is optional; absence is reported in the notes.

## Limits

- Usage windows are assigned by the event/session timestamp; a session spanning a boundary is counted at its updated time.
- Bifrost log retention is short; attribution is best-effort.
- Pricing is a bundled estimate and belongs in `server/pricing.ts`.
