import path from "node:path";

import type { FileSystem } from "../filesystem/filesystem.js";
import type { PythonProjectMetadata } from "./types.js";

const pythonMarkerFiles = ["pyproject.toml", "requirements.txt", "setup.py"] as const;

export async function scanPythonProject(
  fileSystem: FileSystem,
  repositoryRoot: string,
): Promise<PythonProjectMetadata> {
  const markers = await Promise.all(
    pythonMarkerFiles.map(async (file) => ({
      file,
      exists: await fileSystem.exists(path.join(repositoryRoot, file)),
    })),
  );
  const markerFiles = markers.filter((marker) => marker.exists).map((marker) => marker.file);

  return {
    present: markerFiles.length > 0,
    markerFiles,
  };
}
