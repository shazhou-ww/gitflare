import { createErrorResponse } from "./auth";
import { handleBranches } from "./branches";
import { handleComments } from "./comments";
import { handleCommits } from "./commits";
import { handleIssues } from "./issues";
import { handleRepos } from "./repos";
import { handleBlob, handleTree } from "./tree";
import { handleTokenLogin } from "./token-login";

export async function handleApiV1(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Remove /api/v1 prefix
  const apiPath = pathname.replace(/^\/api\/v1\/?/, "");
  const pathParts = apiPath.split("/").filter(Boolean);

  if (pathParts.length === 0) {
    return createErrorResponse("API v1 endpoint", 404);
  }

  try {
    // Route to appropriate handlers
    if (pathParts[0] === "auth" && pathParts[1] === "token-login") {
      return handleTokenLogin(request);
    }
    
    if (pathParts[0] === "repos") {
      // Remove 'repos' from path parts
      const repoPathParts = pathParts.slice(1);

      if (repoPathParts.length >= 2 && repoPathParts.length >= 3) {
        const endpoint = repoPathParts[2];

        if (endpoint === "issues") {
          // Issues or comments endpoints
          if (repoPathParts.length >= 5 && repoPathParts[4] === "comments") {
            return handleComments(request, repoPathParts);
          }
          return handleIssues(request, repoPathParts);
        }
        if (endpoint === "branches") {
          return handleBranches(request, repoPathParts);
        }
        if (endpoint === "commits") {
          return handleCommits(request, repoPathParts);
        }
        if (endpoint === "tree") {
          return handleTree(request, repoPathParts);
        }
        if (endpoint === "blob") {
          return handleBlob(request, repoPathParts);
        }
      }

      // Default repos handling
      return handleRepos(request, repoPathParts);
    }

    return createErrorResponse("Endpoint not found", 404);
  } catch (error) {
    console.error("API v1 error:", error);
    return createErrorResponse("Internal server error", 500);
  }
}
