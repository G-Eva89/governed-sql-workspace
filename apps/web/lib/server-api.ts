import { cookies } from "next/headers";
import {
  connectionListResponseSchema,
  type ConnectionPublic,
} from "@governed-sql/schemas";
import { getServerApiUrl } from "./config";
import { SESSION_COOKIE_NAME } from "./constants";

async function fetchWithSession(path: string): Promise<Response> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!sessionCookie) {
    throw new Error("Not authenticated");
  }

  return fetch(`${getServerApiUrl()}${path}`, {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie.value}`,
    },
    cache: "no-store",
  });
}

export async function listConnections(): Promise<ConnectionPublic[]> {
  const response = await fetchWithSession("/connections");
  if (!response.ok) {
    return [];
  }

  const data: unknown = await response.json();
  const parsed = connectionListResponseSchema.parse(data);
  return parsed.connections.filter((connection) => connection.status === "active");
}
