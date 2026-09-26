// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Domain-level errors for the data access layer. These carry no HTTP
// concerns (no status codes) — route handlers map them to API errors.

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class DuplicateSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateSubmissionError";
  }
}

export class SubmissionFinalizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionFinalizedError";
  }
}

export class DeterministicVerificationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeterministicVerificationRequiredError";
  }
}

export class SubmissionNotAcceptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionNotAcceptedError";
  }
}

export class SettlementAlreadyInProgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementAlreadyInProgressError";
  }
}

export class SettlementInconsistentStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementInconsistentStateError";
  }
}

export class DatasetImmutableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatasetImmutableError";
  }
}
