import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { Dashboard } from "./client/dashboard";

function Item({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return <SidebarRow icon="ChartNoAxesColumn" active={currentScreen?.screenId === "usage-ledger"} onPress={() => openScreen({ screenId: "usage-ledger" })} />;
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "usage-ledger", title: "Usage Ledger", Component: Dashboard });
  client.addSidebarHeaderItem({ id: "usage-ledger", title: "Usage Ledger", Component: Item });
  return () => {};
}
