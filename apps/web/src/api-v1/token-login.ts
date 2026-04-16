import { auth } from "@/lib/auth";
import { db } from "@/db";
import { session } from "@/db/schema/auth";
import { createErrorResponse, createSuccessResponse } from "./auth";
import crypto from "crypto";

function generateRandomString(length: number): string {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

export async function handleTokenLogin(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return createErrorResponse("Method not allowed", 405);
  }

  try {
    const body = await request.json() as { key?: string };
    const { key } = body;

    if (!key || typeof key !== "string") {
      return createErrorResponse("API key is required", 400);
    }

    // Verify API key using Better Auth
    const apiKeyResult = await auth.api.verifyApiKey({
      body: { key },
    });

    if (!apiKeyResult.valid || !apiKeyResult.key) {
      return createErrorResponse("Invalid API key", 401);
    }

    const userId = apiKeyResult.key.userId;

    // Generate session token and create session record directly in database
    const sessionToken = generateRandomString(32); // Generate a 32-character random string
    const sessionId = generateRandomString(16);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Insert session into database
    await db.insert(session).values({
      id: sessionId,
      token: sessionToken,
      userId: userId,
      expiresAt: expiresAt,
      ipAddress: request.headers.get("CF-Connecting-IP") || 
                 request.headers.get("X-Forwarded-For") || 
                 request.headers.get("X-Real-IP") ||
                 "unknown",
      userAgent: request.headers.get("User-Agent") || "unknown",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create response with session cookie
    const response = createSuccessResponse({ 
      message: "Login successful",
      userId 
    }, 200);

    // Set the session cookie (Better Auth uses this cookie name)
    const cookieName = "better-auth.session_token";
    const cookieValue = sessionToken;
    const cookieOptions = [
      `${cookieName}=${cookieValue}`,
      "HttpOnly",
      "Secure", 
      "SameSite=Lax",
      `Max-Age=${7 * 24 * 60 * 60}`, // 7 days
      "Path=/"
    ];

    response.headers.set("Set-Cookie", cookieOptions.join("; "));

    return response;

  } catch (error) {
    console.error("Token login error:", error);
    if (error instanceof Error && error.message.includes("API key")) {
      return createErrorResponse("Invalid API key", 401);
    }
    return createErrorResponse("Internal server error", 500);
  }
}