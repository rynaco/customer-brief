const MAX_CALLS_PER_PROCESS = 50;

let callCount = 0;

export function consumeBudget(): void {
  if (callCount >= MAX_CALLS_PER_PROCESS) {
    throw new BudgetExceededError(
      `Demo budget exhausted (${MAX_CALLS_PER_PROCESS} Claude calls). Restart the server to reset.`,
    );
  }
  callCount += 1;
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}
