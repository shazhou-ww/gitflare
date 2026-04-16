import { Comment } from "@/db/comment";
import {
  ApiError,
  createErrorResponse,
  createSuccessResponse,
  verifyApiKey,
} from "./auth";

export async function handleComments(
  request: Request,
  pathParts: string[]
): Promise<Response> {
  try {
    const method = request.method;

    // Expected path parts: [:owner, :name, "issues", :number, "comments"]
    if (
      pathParts.length !== 5 ||
      pathParts[2] !== "issues" ||
      pathParts[4] !== "comments"
    ) {
      throw new ApiError("Invalid comments endpoint", 400);
    }

    const owner = pathParts[0];
    const repo = pathParts[1];
    const issueNumber = Number.parseInt(pathParts[3], 10);

    if (Number.isNaN(issueNumber)) {
      throw new ApiError("Invalid issue number", 400);
    }

    if (method === "POST") {
      // POST /api/v1/repos/:owner/:name/issues/:number/comments
      const { user } = await verifyApiKey(request);

      if (!user.username) {
        throw new ApiError("User does not have a username", 400);
      }

      const body = (await request.json()) as {
        body?: string;
      };
      const { body: commentBody } = body;

      if (!commentBody || typeof commentBody !== "string") {
        throw new ApiError("Comment body is required", 400);
      }

      // For simplicity, we'll need to find the issue ID from the issue number
      // This requires importing Issue module
      const { Issue } = await import("@/db/issue");

      const issueResult = await Issue.getByFullNameAndNumber({
        fullName: `${owner}/${repo}`,
        number: issueNumber,
      });

      const issue = issueResult.unwrapOrThrow({
        DatabaseError: "Database error occurred while fetching issue.",
        ValidationError: `Invalid owner or repository name (${owner}/${repo}) or number (${issueNumber}) provided.`,
      });

      if (!issue) {
        throw new ApiError(
          `Issue not found (${owner}/${repo}#${issueNumber})`,
          404
        );
      }

      const commentResult = await Comment.createForIssue({
        issueId: issue.id,
        authorId: user.id,
        authorUsername: user.username,
        body: commentBody,
      });

      const comment = commentResult.unwrapOrThrow({
        DatabaseError: "Database error occurred while creating comment.",
      });

      return createSuccessResponse(comment, 201);
    }

    throw new ApiError("Method not allowed", 405);
  } catch (error) {
    if (error instanceof ApiError) {
      return createErrorResponse(error.message, error.status);
    }
    console.error("Comments API error:", error);
    return createErrorResponse("Internal server error", 500);
  }
}
