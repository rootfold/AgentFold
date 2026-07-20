export const agentFoldMcpToolNames = {
  getStatus: "agentfold_get_status",
  getContext: "agentfold_get_context",
  openSession: "agentfold_open_session",
  beginTask: "agentfold_begin_task",
  reportProgress: "agentfold_report_progress",
  createCheckpoint: "agentfold_create_checkpoint",
  getResumePacket: "agentfold_get_resume_packet",
  closeSession: "agentfold_close_session",
} as const;

export type AgentFoldMcpToolName =
  (typeof agentFoldMcpToolNames)[keyof typeof agentFoldMcpToolNames];
