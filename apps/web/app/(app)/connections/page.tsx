import { ConnectionsManager } from "@/components/connections-manager";
import { getSession } from "@/lib/auth";
import { listAllConnections } from "@/lib/server-api";

export default async function ConnectionsPage() {
  const [connections, session] = await Promise.all([listAllConnections(), getSession()]);

  return (
    <ConnectionsManager
      connections={connections}
      isAdmin={session?.role === "admin"}
    />
  );
}
