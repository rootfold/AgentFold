import { resumePacketSchema } from "./resume-packet-schema.js";
import { truncateResumePacket } from "./truncate-resume-packet.js";
import type { ResumePacket } from "./types.js";

export function renderResumeJson(input: ResumePacket): string {
  const packet = resumePacketSchema.parse(truncateResumePacket(input).packet);
  return `${JSON.stringify(packet, null, 2)}\n`;
}
