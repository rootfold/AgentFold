export const packageManagers = ["pnpm", "npm", "yarn", "bun"] as const;

export type PackageManager = (typeof packageManagers)[number];

export interface NodeProjectMetadata {
  readonly present: boolean;
  readonly nodeVersion?: string;
  readonly scripts: Readonly<Record<string, string>>;
}

export interface PythonProjectMetadata {
  readonly present: boolean;
  readonly markerFiles: readonly string[];
}

export interface PackageManagerMetadata {
  readonly packageManager?: PackageManager;
  readonly lockfiles: readonly string[];
}

export interface RepositoryMetadata {
  readonly repositoryName: string;
  readonly node: NodeProjectMetadata;
  readonly python: PythonProjectMetadata;
  readonly packageManager?: PackageManager;
  readonly lockfiles: readonly string[];
  readonly commands: Readonly<Record<string, string>>;
  readonly sourceDirectories: readonly string[];
  readonly testDirectories: readonly string[];
}
