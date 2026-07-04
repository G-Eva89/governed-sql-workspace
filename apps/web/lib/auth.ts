import { cookies } from "next/headers";
import {
  authMeResponseSchema,
  type AuthMeResponse,
} from "@governed-sql/schemas";
import { getServerApiUrl } from "./config";
import { SESSION_COOKIE_NAME } from "./constants";

export async function getSession(): Promise<AuthMeResponse | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!sessionCookie) {
    return null;
  }

  try {
    const response = await fetch(`${getServerApiUrl()}/auth/me`, {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie.value}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data: unknown = await response.json();
    return authMeResponseSchema.parse(data);
  } catch {
    return null;
  }
}
