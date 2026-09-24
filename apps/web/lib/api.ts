import {
  apiErrorBodySchema,
  connectionListResponseSchema,
  connectionPublicSchema,
  connectionTestResponseSchema,
  loginResponseSchema,
  queryResultSchema,
  type ConnectionPublic,
  type ConnectionTestResult,
  type CreateConnectionRequest,
  type LoginRequest,
  type LoginResponse,
  type QueryResult,
  type RunQueryRequest,
  type UpdateConnectionRequest,
} from "@governed-sql/schemas";
import { API_PREFIX } from "./constants";

export class ApiClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
  }
}

async function parseJsonResponse<T>(
  response: Response,
  schema?: { parse: (data: unknown) => T },
): Promise<T> {
  const data: unknown = await response.json();

  if (!response.ok) {
    const parsed = apiErrorBodySchema.safeParse(data);
    if (parsed.success) {
      throw new ApiClientError(
        parsed.data.error.code,
        parsed.data.error.message,
      );
    }
    throw new ApiClientError("INTERNAL_ERROR", "Request failed");
  }

  return schema ? schema.parse(data) : (data as T);
}

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const response = await fetch(`${API_PREFIX}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(credentials),
  });

  return parseJsonResponse(response, loginResponseSchema);
}

export async function logout(): Promise<void> {
  await fetch(`${API_PREFIX}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function listConnections(): Promise<ConnectionPublic[]> {
  const response = await fetch(`${API_PREFIX}/connections`, {
    credentials: "include",
  });
  const data = await parseJsonResponse(response, connectionListResponseSchema);
  return data.connections.filter((connection) => connection.status === "active");
}

export async function createConnection(
  body: CreateConnectionRequest,
): Promise<ConnectionPublic> {
  const response = await fetch(`${API_PREFIX}/connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  return parseJsonResponse(response, connectionPublicSchema);
}

export async function updateConnection(
  connectionId: string,
  body: UpdateConnectionRequest,
): Promise<ConnectionPublic> {
  const response = await fetch(`${API_PREFIX}/connections/${connectionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  return parseJsonResponse(response, connectionPublicSchema);
}

export async function testConnection(
  connectionId: string,
): Promise<ConnectionTestResult> {
  const response = await fetch(`${API_PREFIX}/connections/${connectionId}/test`, {
    method: "POST",
    credentials: "include",
  });

  return parseJsonResponse(response, connectionTestResponseSchema);
}

export async function runQuery(
  connectionId: string,
  body: RunQueryRequest,
): Promise<QueryResult> {
  const response = await fetch(`${API_PREFIX}/connections/${connectionId}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  return parseJsonResponse(response, queryResultSchema);
}
