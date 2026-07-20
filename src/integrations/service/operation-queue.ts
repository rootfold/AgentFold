export class RepositoryOperationQueue {
  private readonly tails = new Map<string, Promise<void>>();

  async run<Result>(repositoryId: string, operation: () => Promise<Result>): Promise<Result> {
    const previous = this.tails.get(repositoryId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => current);
    this.tails.set(repositoryId, tail);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release?.();
      if (this.tails.get(repositoryId) === tail) this.tails.delete(repositoryId);
    }
  }
}
