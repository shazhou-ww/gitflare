import { getRepoDOStub } from "@/do/repo";
import { ApiError, createErrorResponse, createSuccessResponse } from "./auth";

export async function handleCommits(
  request: Request,
  pathParts: string[]
): Promise<Response> {
  try {
    const method = request.method;
    const url = new URL(request.url);

    if (method !== "GET") {
      throw new ApiError("Method not allowed", 405);
    }

    const owner = pathParts[0];
    const repo = pathParts[1];

    if (pathParts.length === 3 && pathParts[2] === "commits") {
      // GET /api/v1/repos/:owner/:name/commits?ref=main
      const ref = url.searchParams.get("ref") || undefined;
      const limit = url.searchParams.get("limit");
      const limitNumber = limit ? Number.parseInt(limit, 10) : undefined;

      const fullName = `${owner}/${repo}`;
      const stub = getRepoDOStub(fullName);
      const commits = await stub.getCommits({
        depth: limitNumber,
        ref,
      });

      return createSuccessResponse(commits);
    }
    if (pathParts.length === 4 && pathParts[2] === "commits") {
      // GET /api/v1/repos/:owner/:name/commits/:sha
      const sha = pathParts[3];

      const fullName = `${owner}/${repo}`;
      const stub = getRepoDOStub(fullName);
      const { commit, changes } = await stub.getCommit(sha);

      return createSuccessResponse({
        commit,
        changes,
      });
    }

    throw new ApiError("Invalid commits endpoint", 400);
  } catch (error) {
    if (error instanceof ApiError) {
      return createErrorResponse(error.message, error.status);
    }
    console.error("Commits API error:", error);
    return createErrorResponse("Internal server error", 500);
  }
}
