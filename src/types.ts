export enum Severity {
  SAFE = "SAFE",
  LOW = "LOW",
  SUSPICIOUS = "SUSPICIOUS",
  CRITICAL = "CRITICAL",
}

export interface Finding {
  rule: string;
  severity: Severity;
  line: number;
  message: string;
  before: string;
  after: string;
}

export type StubStatus = "pending" | "approved" | "rejected" | "needs_fix" | "resolved";

export interface StubFile {
  id: string;
  created_at: string;
  severity: Severity;
  status: StubStatus;
  llm_enriched: boolean;
  test_file: string;
  test_functions: string[];
  prod_files_related: string[];
  commit: string;
  parent_commit: string;
  diff_hash: string;
  parent_verification_id?: string;
}

export interface AnalysisResult {
  summary: string;
  detail: string;
  concerns: string[];
  overallSeverity: Severity;
  tautologyDetected: boolean;
}

export interface DecisionRecord {
  approver: string;
  rationale: string;
  signature: string;
}
