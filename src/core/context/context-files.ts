export const canonicalContextFiles = {
  project: ".agentfold/context/project.md",
  architecture: ".agentfold/context/architecture.md",
  commands: ".agentfold/context/commands.md",
  conventions: ".agentfold/context/conventions.md",
  safety: ".agentfold/context/safety.md",
} as const;

export type CanonicalContextFileName = keyof typeof canonicalContextFiles;

export const canonicalContextFileEntries = Object.entries(
  canonicalContextFiles,
) as readonly (readonly [
  CanonicalContextFileName,
  (typeof canonicalContextFiles)[CanonicalContextFileName],
])[];
