import { User } from "@/db/user";
import { auth } from "@/lib/auth";
import type { ApiErrorResponse } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export async function verifyApiKey(
  request: Request
): Promise<{
  user: { id: string; username: string | null; email: string };
  userId: string;
}> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError("Missing or invalid Authorization header", 401);
  }

  const bearerToken = authHeader.substring(7); // Remove "Bearer " prefix

  try {
    const apiKeyResult = await auth.api.verifyApiKey({
      body: { key: bearerToken },
    });

    if (!apiKeyResult.valid || !apiKeyResult.key) {
      throw new ApiError("Invalid API key", 401);
    }

    const userId = apiKeyResult.key.userId;
    const userResult = await User.getById({ id: userId });
    const user = userResult.unwrapOrThrow({
      DatabaseError: "Database error occurred while fetching user.",
    });

    if (!user) {
      throw new ApiError("User not found", 401);
    }

    return { user, userId };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Authentication failed", 401);
  }
}

export function createErrorResponse(message: string, status = 500): Response {
  const errorResponse: ApiErrorResponse = { error: message };
  return new Response(JSON.stringify(errorResponse), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createSuccessResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
