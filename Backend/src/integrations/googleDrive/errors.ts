/** Thrown for a single subfolder/file the service account isn't shared on — traversal should skip it and keep going. */
export class DrivePermissionError extends Error {
  constructor(
    message: string,
    public override readonly cause: unknown,
  ) {
    super(message);
    this.name = 'DrivePermissionError';
  }
}

/** Thrown when the service account credentials themselves are invalid/expired — fatal for the whole job, not just one file. */
export class DriveAuthError extends Error {
  constructor(
    message: string,
    public override readonly cause: unknown,
  ) {
    super(message);
    this.name = 'DriveAuthError';
  }
}

/** Rate limit / transient error that exhausted retries, or any other unexpected Drive API failure. */
export class DriveApiError extends Error {
  constructor(
    message: string,
    public override readonly cause: unknown,
  ) {
    super(message);
    this.name = 'DriveApiError';
  }
}
