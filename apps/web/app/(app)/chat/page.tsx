import { ChatWorkspace } from "@/components/chat-workspace";
import { listConnections } from "@/lib/server-api";

export default async function ChatPage() {
  const connections = await listConnections();

  return <ChatWorkspace connections={connections} />;
}
