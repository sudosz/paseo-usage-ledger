import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Dashboard } from "./client/dashboard";
import { UsageSidebarItem } from "./client/sidebar";

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "usage-ledger", title: "Usage Ledger", Component: Dashboard });
  client.addSidebarFooterItem({
    id: "usage-ledger",
    title: "Usage Ledger",
    Component: UsageSidebarItem,
  });
  return () => {};
}
