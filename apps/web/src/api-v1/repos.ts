import { Repo } from "@/db/repo";
import { getRepoDOStub } from "@/do/repo";
import {
  ApiError,
  createErrorResponse,
  createSuccessResponse,
  verifyApiKey,
} from "./auth";

export async function handleRepos(
  request: Request,
  pathParts: string[]
): Promise<Response> {
  try {
    const method = request.method;

    if (method === "GET") {
      if (pathParts.length === 1) {
        // GET /api/v1/repos/:owner
        const owner = pathParts[0];
        const result = await Repo.getByOwner({ owner });
        const repos = result.unwrapOrThrow({
          DatabaseError: "Database error occurred while fetching repositories.",
          ValidationError: `Invalid owner name (${owner}) provided.`,
        });
        return createSuccessResponse(repos);
      }
      if (pathParts.length === 2) {
        // GET /api/v1/repos/:owner/:name
        const [owner, name] = pathParts;
        const result = await Repo.getByOwnerAndName({ owner, name });
        const repo = result.unwrapOrThrow({
          DatabaseError: "Database error occurred while fetching repository.",
        });
        if (!repo) {
          throw new ApiError("Repository not found", 404);
        }
        return createSuccessResponse(repo);
      }
    } else if (method === "POST" && pathParts.length === 0) {
      // POST /api/v1/repos - create repo
      const { user } = await verifyApiKey(request);

      if (!user.username) {
        throw new ApiError("User does not have a username", 400);
      }

      const body = (await request.json()) as {
        name?: string;
        description?: string;
        isPrivate?: boolean;
      };
      const { name, description, isPrivate } = body;

      if (!name || typeof name !== "string") {
        throw new ApiError("Repository name is required", 400);
      }

      // Validate name format
      if (name.length > 100) {
        throw new ApiError(
          "Repository name must be less than 100 characters",
          400
        );
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        throw new ApiError(
          "Repository name can only contain letters, numbers, hyphens, and underscores",
          400
        );
      }
      if (name.endsWith(".git")) {
        throw new ApiError("Repository name cannot end with .git", 400);
      }

      const result = await Repo.create({
        name,
        description: description?.trim() || undefined,
        isPrivate: Boolean(isPrivate),
        ownerId: user.id,
        owner: user.username,
      });

      const repo = result.unwrapOrThrow({
        DatabaseError: "Database error occurred while creating repository.",
      });

      const fullName = `${repo.owner}/${repo.name}`;
      const stub = getRepoDOStub(fullName);
      await stub.ensureRepoInitialized();

      return createSuccessResponse(repo, 201);
    } else if (method === "PATCH" && pathParts.length === 2) {
      // PATCH /api/v1/repos/:owner/:name
      const { user } = await verifyApiKey(request);

      const [owner, name] = pathParts;
      const body = (await request.json()) as {
        description?: string;
        isPrivate?: boolean;
      };
      const { description, isPrivate } = body;

      const repoResult = await Repo.getByOwnerAndName({ owner, name });
      const repo = repoResult.unwrapOrThrow({
        DatabaseError: "Database error occurred while fetching repository.",
      });

      if (!repo) {
        throw new ApiError("Repository not found", 404);
      }

      if (repo.ownerId !== user.id) {
        throw new ApiError(
          "You do not have permission to update this repository",
          403
        );
      }

      const updatedRepoResult = await Repo.update({
        id: repo.id,
        description: description?.trim() || undefined,
        isPrivate: isPrivate !== undefined ? Boolean(isPrivate) : undefined,
        ownerId: repo.ownerId,
      });

      const updatedRepo = updatedRepoResult.unwrapOrThrow({
        DatabaseError: "Database error occurred while updating repository.",
      });

      return createSuccessResponse(updatedRepo);
    } else if (method === "DELETE" && pathParts.length === 2) {
      // DELETE /api/v1/repos/:owner/:name
      const { user } = await verifyApiKey(request);

      const [owner, name] = pathParts;
      
      const repoResult = await Repo.getByOwnerAndName({ owner, name });
      const repo = repoResult.unwrapOrThrow({
        DatabaseError: "Database error occurred while fetching repository.",
      });

      if (!repo) {
        throw new ApiError("Repository not found", 404);
      }

      if (repo.ownerId !== user.id) {
        throw new ApiError(
          "You do not have permission to delete this repository",
          403
        );
      }

      const deleteResult = await Repo.remove({ id: repo.id });
      deleteResult.unwrapOrThrow({
        DatabaseError: "Database error occurred while deleting repository.",
      });

      return createSuccessResponse({ message: "Repository deleted successfully" });
    }

    throw new ApiError("Method not allowed", 405);
  } catch (error) {
    if (error instanceof ApiError) {
      return createErrorResponse(error.message, error.status);
    }
    console.error("Repos API error:", error);
    return createErrorResponse("Internal server error", 500);
  }
}
