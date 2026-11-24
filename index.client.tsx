import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Dashboard } from "./client/dashboard";
import { UsageNavItem, UsageSidebarItem } from "./client/sidebar";

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "usage-ledger", title: "Usage Ledger", Component: Dashboard });
  client.addSidebarHeaderItem({
    id: "usage-ledger-nav",
    title: "Usage Ledger",
    Component: UsageNavItem,
  });
  client.addSidebarFooterItem({
    id: "usage-ledger",
    title: "Usage Ledger",
    Component: UsageSidebarItem,
  });
  return () => {};
}
