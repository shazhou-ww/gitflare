import { getRepoDOStub } from "@/do/repo";
import { ApiError, createErrorResponse, createSuccessResponse } from "./auth";

export async function handleBranches(
  request: Request,
  pathParts: string[]
): Promise<Response> {
  try {
    const method = request.method;

    // Expected: /api/v1/repos/:owner/:name/branches
    if (
      method !== "GET" ||
      pathParts.length !== 3 ||
      pathParts[2] !== "branches"
    ) {
      throw new ApiError("Method not allowed", 405);
    }

    const owner = pathParts[0];
    const repo = pathParts[1];

    const fullName = `${owner}/${repo}`;
    const stub = getRepoDOStub(fullName);
    const result = await stub.getBranches();

    return createSuccessResponse({
      branches: result.branches,
      currentBranch: result.currentBranch,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return createErrorResponse(error.message, error.status);
    }
    console.error("Branches API error:", error);
    return createErrorResponse("Internal server error", 500);
  }
}
