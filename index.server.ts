import type { PluginServerContext } from "@getpaseo/plugin/server";
import { summary } from "./shared/contracts";
import { summary as readSummary } from "./server/ledger";

export default function contribute(server: PluginServerContext) {
  server.handle(summary, input => readSummary(input.range, input.refresh));
  return () => {};
}
