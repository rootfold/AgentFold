export interface GitRepositoryLocator {
  findRoot(startDirectory: string): Promise<string | undefined>;
}
