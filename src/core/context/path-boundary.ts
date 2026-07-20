import path from "node:path";

export function resolvePortableRepositoryPath(
  repositoryRoot: string,
  portablePath: string,
): string {
  return path.resolve(repositoryRoot, ...portablePath.split("/"));
}

export function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));

  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}
