const checkpointFilePattern = /^(AF-\d{8}-\d{3})-(CP-(\d{3}))\.md$/u;

export interface AllocatedCheckpointId {
  readonly checkpointId: string;
  readonly fileName: string;
}

export class CheckpointSequenceExhaustedError extends Error {
  constructor(readonly taskId: string) {
    super(`No checkpoint IDs remain for task ${taskId}`);
    this.name = "CheckpointSequenceExhaustedError";
  }
}

export function checkpointSequenceFromFileName(taskId: string, fileName: string): number | null {
  const match = fileName.match(checkpointFilePattern);
  return match !== null && match[1] === taskId ? Number(match[3]) : null;
}

export function allocateCheckpointId(
  taskId: string,
  checkpointCount: number,
  historyFileNames: readonly string[],
): AllocatedCheckpointId {
  const sequences = historyFileNames
    .map((fileName) => checkpointSequenceFromFileName(taskId, fileName))
    .filter((sequence): sequence is number => sequence !== null);
  const sequence = Math.max(checkpointCount, 0, ...sequences) + 1;
  if (sequence > 999) throw new CheckpointSequenceExhaustedError(taskId);

  const checkpointId = `CP-${sequence.toString().padStart(3, "0")}`;
  return { checkpointId, fileName: `${taskId}-${checkpointId}.md` };
}
