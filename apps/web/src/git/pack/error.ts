import { TaggedError } from "better-result";

export type PackfileParseErrorCode =
  | "INVALID_SIGNATURE"
  | "UNSUPPORTED_VERSION"
  | "UNEXPECTED_EOF"
  | "CHECKSUM_MISMATCH"
  | "INVALID_OBJECT_HEADER"
  | "DECOMPRESSION_FAILED";

export class PackfileParseError extends TaggedError("PackfileParseError")<{
  offset: number;
  code: PackfileParseErrorCode;
  message: string;
  objectsParsed: number;
}>() {}
