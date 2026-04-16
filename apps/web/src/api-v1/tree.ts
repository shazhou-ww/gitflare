import { getRepoDOStub } from "@/do/repo";
import { ApiError, createErrorResponse, createSuccessResponse } from "./auth";

export async function handleTree(
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

    if (pathParts.length === 3 && pathParts[2] === "tree") {
      // GET /api/v1/repos/:owner/:name/tree?ref=main&path=src
      const ref = url.searchParams.get("ref") || undefined;
      const path = url.searchParams.get("path") || undefined;

      const fullName = `${owner}/${repo}`;
      const stub = getRepoDOStub(fullName);
      const tree = await stub.getTree({ ref, path });

      return createSuccessResponse(tree);
    }

    throw new ApiError("Invalid tree endpoint", 400);
  } catch (error) {
    if (error instanceof ApiError) {
      return createErrorResponse(error.message, error.status);
    }
    console.error("Tree API error:", error);
    return createErrorResponse("Internal server error", 500);
  }
}

export async function handleBlob(
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

    if (pathParts.length === 3 && pathParts[2] === "blob") {
      // GET /api/v1/repos/:owner/:name/blob?ref=main&path=README.md
      const ref = url.searchParams.get("ref") || undefined;
      const filepath = url.searchParams.get("path");

      if (!filepath) {
        throw new ApiError("File path is required", 400);
      }

      const fullName = `${owner}/${repo}`;
      const stub = getRepoDOStub(fullName);
      const blob = await stub.getBlob({ ref, filepath });

      if (!blob) {
        throw new ApiError("File not found", 404);
      }

      // Handle blob.content which might be a Uint8Array or a plain object from JSON serialization
      let contentBuffer: Buffer;
      if (blob.content instanceof Uint8Array) {
        contentBuffer = Buffer.from(blob.content);
      } else if (typeof blob.content === "object" && blob.content !== null) {
        // Handle JSON-serialized Uint8Array (object with numeric keys)
        contentBuffer = Buffer.from(Object.values(blob.content) as number[]);
      } else {
        contentBuffer = Buffer.from(blob.content as string);
      }

      const contentBase64 = contentBuffer.toString("base64");

      return createSuccessResponse({
        oid: blob.oid,
        content: contentBase64,
        size: blob.size,
        isBinary: blob.isBinary,
      });
    }

    throw new ApiError("Invalid blob endpoint", 400);
  } catch (error) {
    if (error instanceof ApiError) {
      return createErrorResponse(error.message, error.status);
    }
    console.error("Blob API error:", error);
    return createErrorResponse("Internal server error", 500);
  }
}
