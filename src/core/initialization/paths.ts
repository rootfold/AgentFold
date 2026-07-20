export const agentFoldDirectory = ".agentfold";

export const initializationFilePaths = [
  "config.yaml",
  "context/project.md",
  "context/architecture.md",
  "context/commands.md",
  "context/conventions.md",
  "context/safety.md",
  "manifest.json",
] as const;

export const managedPayloadPaths = initializationFilePaths.filter(
  (file): file is Exclude<(typeof initializationFilePaths)[number], "manifest.json"> =>
    file !== "manifest.json",
);

export function agentFoldPath(relativePath: string): string {
  return `${agentFoldDirectory}/${relativePath}`;
}

export function portablePath(input: string): string {
  return input.replaceAll("\\", "/");
}
