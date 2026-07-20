const taskIdPattern = /^AF-(\d{8})-(\d{3})$/u;

function utcDateStamp(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

export function generateTaskId(date: Date, existingTaskIds: readonly string[]): string {
  const dateStamp = utcDateStamp(date);
  const usedSequences = existingTaskIds
    .map((taskId) => taskId.match(taskIdPattern))
    .filter((match): match is RegExpMatchArray => match !== null && match[1] === dateStamp)
    .map((match) => Number(match[2]));
  const sequence = Math.max(0, ...usedSequences) + 1;

  if (sequence > 999) {
    throw new Error(`No task IDs remain for ${dateStamp}`);
  }

  return `AF-${dateStamp}-${sequence.toString().padStart(3, "0")}`;
}
