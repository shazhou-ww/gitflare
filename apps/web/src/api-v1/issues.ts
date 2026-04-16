import { Issue } from "@/db/issue";
import { Repo } from "@/db/repo";
import {
  ApiError,
  createErrorResponse,
  createSuccessResponse,
  verifyApiKey,
} from "./auth";

export async function handleIssues(
  request: Request,
  pathParts: string[]
): Promise<Response> {
  try {
    const method = request.method;

    if (pathParts.length < 3 || pathParts[2] !== "issues") {
      throw new ApiError("Invalid issues endpoint", 400);
    }

    const owner = pathParts[0];
    const repo = pathParts[1];

    if (method === "GET") {
      if (pathParts.length === 3) {
        // GET /api/v1/repos/:owner/:name/issues
        const result = await Issue.getByFullName({
          fullName: `${owner}/${repo}`,
        });
        const issues = result.unwrapOrThrow({
          DatabaseError: "Database error occurred while fetching issues.",
          ValidationError: `Invalid owner or repository name (${owner}/${repo}) provided.`,
        });
        return createSuccessResponse(issues);
      }
      if (pathParts.length === 4) {
        // GET /api/v1/repos/:owner/:name/issues/:number
        const number = Number.parseInt(pathParts[3], 10);
        if (Number.isNaN(number)) {
          throw new ApiError("Invalid issue number", 400);
        }

        const result = await Issue.getByFullNameAndNumber({
          fullName: `${owner}/${repo}`,
          number,
        });
        const issue = result.unwrapOrThrow({
          DatabaseError: "Database error occurred while fetching issue.",
          ValidationError: `Invalid owner or repository name (${owner}/${repo}) or number (${number}) provided.`,
        });

        if (!issue) {
          throw new ApiError(
            `Issue not found (${owner}/${repo}#${number})`,
            404
          );
        }

        return createSuccessResponse(issue);
      }
    } else if (method === "POST" && pathParts.length === 3) {
      // POST /api/v1/repos/:owner/:name/issues
      const { user } = await verifyApiKey(request);

      if (!user.username) {
        throw new ApiError("User does not have a username", 400);
      }

      const body = (await request.json()) as {
        title?: string;
        body?: string;
      };
      const { title, body: issueBody } = body;

      if (!title || typeof title !== "string") {
        throw new ApiError("Issue title is required", 400);
      }
      if (!issueBody || typeof issueBody !== "string") {
        throw new ApiError("Issue body is required", 400);
      }

      // Check if repository exists
      const repositoryResult = await Repo.getByOwnerAndName({
        owner,
        name: repo,
      });
      const repository = repositoryResult.unwrapOrThrow({
        DatabaseError: "Database error occurred while fetching repository.",
        ValidationError: `Invalid owner or repository name (${owner}/${repo}) provided.`,
      });

      if (!repository) {
        throw new ApiError(`Repository not found (${owner}/${repo})`, 404);
      }

      // Get last issue number
      const lastNumberResult = await Issue.getLastNumber({
        fullName: `${owner}/${repo}`,
      });
      const lastNumber = lastNumberResult.unwrapOrThrow({
        DatabaseError:
          "Database error occurred while fetching last issue number.",
      });

      // Create issue
      const issueResult = await Issue.create({
        creatorId: user.id,
        creatorUsername: user.username,
        repositoryId: repository.id,
        fullName: `${owner}/${repo}`,
        number: lastNumber + 1,
        title,
        body: issueBody,
      });

      const issue = issueResult.unwrapOrThrow({
        DatabaseError: "Database error occurred while creating issue.",
      });

      return createSuccessResponse(issue, 201);
    } else if (method === "PATCH" && pathParts.length === 4) {
      // PATCH /api/v1/repos/:owner/:name/issues/:number
      const { user } = await verifyApiKey(request);

      const number = Number.parseInt(pathParts[3], 10);
      if (Number.isNaN(number)) {
        throw new ApiError("Invalid issue number", 400);
      }

      const body = (await request.json()) as {
        status?: string;
      };
      const { status } = body;

      if (
        !status ||
        !(["open", "closed"] as const).includes(status as "open" | "closed")
      ) {
        throw new ApiError("Status must be 'open' or 'closed'", 400);
      }

      const validStatus = status as "open" | "closed";

      // Get issue
      const issueResult = await Issue.getByFullNameAndNumber({
        fullName: `${owner}/${repo}`,
        number,
      });
      const issue = issueResult.unwrapOrThrow({
        DatabaseError: "Database error occurred while fetching issue.",
        ValidationError: `Invalid owner or repository name (${owner}/${repo}) or number (${number}) provided.`,
      });

      if (!issue) {
        throw new ApiError(`Issue not found (${owner}/${repo}#${number})`, 404);
      }

      if (issue.creatorId !== user.id) {
        throw new ApiError(
          "You do not have permission to update this issue",
          403
        );
      }

      // Update issue
      const updatedIssueResult = await Issue.update({
        id: issue.id,
        status: validStatus,
      });

      const updatedIssue = updatedIssueResult.unwrapOrThrow({
        DatabaseError: "Database error occurred while updating issue.",
      });

      return createSuccessResponse(updatedIssue);
    }

    throw new ApiError("Method not allowed", 405);
  } catch (error) {
    if (error instanceof ApiError) {
      return createErrorResponse(error.message, error.status);
    }
    console.error("Issues API error:", error);
    return createErrorResponse("Internal server error", 500);
  }
}
