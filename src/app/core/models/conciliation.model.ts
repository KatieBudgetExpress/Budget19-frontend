export type ConciliationOperationDirection = 'credit' | 'debit';

export interface ConciliationOperationSuggestion {
  transactionId: string;
  label: string;
  score: number;
}

export interface ConciliationOperation {
  id: string;
  date: string;
  label: string;
  reference?: string;
  amount: number;
  direction: ConciliationOperationDirection;
  category?: string;
  matchedTransactionId?: string | null;
  matchedAt?: string | null;
  matchingScore?: number | null;
  status?: 'matched' | 'pending' | 'ignored' | 'manual';
  notes?: string | null;
  suggestions?: ConciliationOperationSuggestion[];
}

export interface ConciliationStatement {
  id: string;
  reference?: string;
  accountId?: string;
  accountName?: string;
  importedAt?: string;
  startDate: string;
  endDate: string;
  currency?: string;
  balanceBefore?: number;
  balance?: number;
  balanceAfter?: number;
  totalCredits?: number;
  totalDebits?: number;
  operations?: ConciliationOperation[];
  metadata?: Record<string, unknown>;
}

export interface ConciliationResultSummary {
  totalOperations: number;
  matchedAutomatically: number;
  matchedManually: number;
  ignored: number;
  remaining: number;
  balanceGap: number;
  currency?: string;
  completedAt?: string;
}

export interface ConciliationResult {
  statement: ConciliationStatement;
  matchedOperations: ConciliationOperation[];
  manualDecisions: ConciliationOperation[];
  unmatchedOperations: ConciliationOperation[];
  summary?: Partial<ConciliationResultSummary>;
  status: 'draft' | 'pending' | 'validated';
  validatedAt?: string;
  validatedBy?: string;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ConciliationMatchResponse {
  statement: ConciliationStatement;
  matchedOperations: ConciliationOperation[];
  unmatchedOperations: ConciliationOperation[];
  suggestedOperations?: ConciliationOperation[];
  stats?: {
    matchRate: number;
    automaticMatches: number;
    totalOperations: number;
  };
}
