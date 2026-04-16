export type ApiResponse<T = unknown> = {
  data?: T;
  error?: string;
};

export type ApiErrorResponse = {
  error: string;
};

export type ApiSuccessResponse<T> = {
  data: T;
};
