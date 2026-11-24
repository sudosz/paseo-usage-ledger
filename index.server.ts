import type { PluginServerContext } from "@getpaseo/plugin/server";
import { summary } from "./shared/contracts";
import { invalidateSummaries, summary as readSummary } from "./server/ledger";

export default function contribute(server: PluginServerContext) {
  server.handle(summary, (input) => readSummary(input.range, input.refresh));
  // A finished turn appended usage; forget the cached totals so the footer's
  // next check sees it without polling the files on every token.
  server.on("agent.turn_ended", invalidateSummaries);
  return () => {};
}
