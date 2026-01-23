export type Progress = {
  bytesRead: number;
  objectsParsed: number;
  objectsTotal: number;
};

export type PackfileHeader = {
  type: "header";
  version: 2 | 3;
  objectCount: number;
};

export type PackfileResult = {
  type: "result";
  checksum: string;
  valid: boolean;
};

export type BaseObject = {
  type: "object";
  objectType: "commit" | "tree" | "blob" | "tag";
  data: Uint8Array;
  size: number;
  offset: number;
};

export type OfsDeltaObject = {
  type: "object";
  objectType: "ofs_delta";
  data: Uint8Array;
  size: number;
  offset: number;
  baseOffset: number;
};

export type RefDeltaObject = {
  type: "object";
  objectType: "ref_delta";
  data: Uint8Array;
  size: number;
  offset: number;
  baseHash: string;
};

export type PackfileObject = BaseObject | OfsDeltaObject | RefDeltaObject;
export type PackfileEvent = PackfileHeader | PackfileObject | PackfileResult;
