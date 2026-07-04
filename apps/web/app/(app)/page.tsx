import { QueryWorkspace } from "@/components/query-workspace";
import { listConnections } from "@/lib/server-api";

export default async function HomePage() {
  const connections = await listConnections();

  return <QueryWorkspace connections={connections} />;
}
