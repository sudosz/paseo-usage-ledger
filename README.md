# Usage Ledger

Paseo plugin for token, cache, and cost analytics across OpenCode, Claude Code, and Codex.

Open **Usage Ledger** in the sidebar. Choose 24h, 7d, 30d or 90d. Scans run on demand, cache for 60 seconds, and never poll in the background. Switch the chart between a filled curve and bars.

Bifrost attribution is optional. Install the small snapshot exporter on the host:

```bash
sudo install -m 755 tools/bifrost-usage-export.py /usr/local/bin/
sudo crontab -e   # */5 * * * * /usr/local/bin/bifrost-usage-export.py
```

It writes only aggregate session/lane rows to `~/.paseo/usage/bifrost.json`; Bifrost's config database stays private.

See [OVERVIEW.md](OVERVIEW.md) for sources, cost estimates, and limits.
