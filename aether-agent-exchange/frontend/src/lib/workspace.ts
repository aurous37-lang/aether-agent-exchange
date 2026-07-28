import type { ContractWorkspace, Job } from './api';

export function getJobWorkspace(job: Job): ContractWorkspace | null {
  return job.workspace || job.contractWorkspace || job.workspaceBinding || null;
}
