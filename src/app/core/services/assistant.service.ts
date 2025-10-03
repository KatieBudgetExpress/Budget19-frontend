import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, delay, map, of } from 'rxjs';

const ASSISTANT_STORAGE_KEY = 'budget19-assistant-draft';
const OFFLINE_DELAY_MS = 220;

export type AssistantWizardStep = 'profile' | 'incomes' | 'expenses' | 'confirmation';
export type AssistantProfileType = 'solo' | 'couple' | 'family' | 'custom';
export type AssistantIncomeFrequency = 'monthly' | 'quarterly' | 'yearly' | 'punctual';
export type AssistantExpenseRecurrence = 'fixed' | 'variable';
export type AssistantExpenseCategory =
  | 'housing'
  | 'transport'
  | 'food'
  | 'health'
  | 'leisure'
  | 'education'
  | 'savings'
  | 'other';

const VALID_STEPS: AssistantWizardStep[] = ['profile', 'incomes', 'expenses', 'confirmation'];
const VALID_PROFILE_TYPES: AssistantProfileType[] = ['solo', 'couple', 'family', 'custom'];
const VALID_INCOME_FREQUENCIES: AssistantIncomeFrequency[] = [
  'monthly',
  'quarterly',
  'yearly',
  'punctual',
];
const VALID_EXPENSE_RECURRENCES: AssistantExpenseRecurrence[] = ['fixed', 'variable'];
const VALID_EXPENSE_CATEGORIES: AssistantExpenseCategory[] = [
  'housing',
  'transport',
  'food',
  'health',
  'leisure',
  'education',
  'savings',
  'other',
];

export interface AssistantSetupProfile {
  profileType: AssistantProfileType;
  householdSize: number;
  monthlySavingsGoal: number;
  currency: string;
}

export interface AssistantSetupIncome {
  label: string;
  amount: number;
  frequency: AssistantIncomeFrequency;
}

export interface AssistantSetupExpense {
  label: string;
  amount: number;
  category: AssistantExpenseCategory;
  recurrence: AssistantExpenseRecurrence;
}

export interface AssistantDraft {
  step: AssistantWizardStep;
  profile: AssistantSetupProfile;
  incomes: AssistantSetupIncome[];
  expenses: AssistantSetupExpense[];
}

interface AssistantDraftRequest extends AssistantDraft {
  sessionId?: string | null;
}

export interface AssistantDraftResponse {
  sessionId?: string | null;
  updatedAt?: string;
  draft: Partial<AssistantDraft>;
}

export interface AssistantCompletionRequest {
  sessionId?: string | null;
  draft: AssistantDraft;
}

export interface AssistantCompletionResponse {
  sessionId: string;
  budgetId: string;
  createdAt: string;
}

interface AssistantDraftStorageSnapshot {
  sessionId: string;
  updatedAt: string;
  draft: AssistantDraft;
}

@Injectable({
  providedIn: 'root',
})
export class AssistantService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/assistant';
  private readonly offlineDelay = OFFLINE_DELAY_MS;

  private sessionId: string | null = null;

  loadDraft(): Observable<AssistantDraft | null> {
    return this.http
      .get<AssistantDraftResponse>(`${this.baseUrl}/draft`)
      .pipe(
        map((response) => this.handleDraftResponse(response)),
        catchError((error: unknown) => this.handleLoadDraftError(error)),
      );
  }

  saveDraft(draft: AssistantDraft): Observable<AssistantDraft> {
    const payload: AssistantDraftRequest = {
      ...this.sanitizeDraft(draft),
      sessionId: this.sessionId ?? null,
    };

    return this.http
      .post<AssistantDraftResponse>(`${this.baseUrl}/draft`, payload)
      .pipe(
        map((response) => this.handleDraftResponse(response)),
        catchError((error: unknown) => this.handleSaveDraftError(error, draft)),
      );
  }

  completeSetup(draft: AssistantDraft): Observable<AssistantCompletionResponse> {
    const payload: AssistantCompletionRequest = {
      sessionId: this.sessionId ?? null,
      draft: this.sanitizeDraft(draft),
    };

    return this.http
      .post<AssistantCompletionResponse>(`${this.baseUrl}/complete`, payload)
      .pipe(
        map((response) => this.handleCompletionResponse(response)),
        catchError((error: unknown) => this.handleCompletionError(error, draft)),
      );
  }

  private handleDraftResponse(response: AssistantDraftResponse): AssistantDraft {
    const sanitized = this.sanitizeDraft(response.draft);
    const snapshot: AssistantDraftStorageSnapshot = {
      sessionId: this.resolveSessionId(response.sessionId),
      updatedAt: this.resolveUpdatedAt(response.updatedAt),
      draft: sanitized,
    };
    this.sessionId = snapshot.sessionId;
    this.writeDraftToStorage(snapshot);
    return sanitized;
  }

  private handleLoadDraftError(error: unknown): Observable<AssistantDraft | null> {
    if (this.isNotFoundError(error)) {
      this.clearDraftStorage();
      this.sessionId = null;
      return of(null);
    }

    console.warn(
      'Impossible de récupérer le brouillon de l’assistant. Utilisation des données locales.',
      error,
    );
    const cached = this.readDraftFromStorage();
    if (cached) {
      this.sessionId = cached.sessionId;
      return of(cached.draft).pipe(delay(this.offlineDelay));
    }

    return of(null);
  }

  private handleSaveDraftError(
    error: unknown,
    draft: AssistantDraft,
  ): Observable<AssistantDraft> {
    console.warn(
      'Impossible de sauvegarder le brouillon de l’assistant via l’API. Sauvegarde locale utilisée.',
      error,
    );
    const snapshot = this.persistDraftLocally(draft);
    return of(snapshot.draft).pipe(delay(this.offlineDelay));
  }

  private handleCompletionResponse(
    response: Partial<AssistantCompletionResponse>,
  ): AssistantCompletionResponse {
    const sanitized = this.normalizeCompletionResponse(response);
    this.sessionId = sanitized.sessionId;
    this.clearDraftStorage();
    this.sessionId = null;
    return sanitized;
  }

  private handleCompletionError(
    error: unknown,
    draft: AssistantDraft,
  ): Observable<AssistantCompletionResponse> {
    console.error(
      'Impossible de finaliser l’assistant budgétaire via l’API. Utilisation d’un résultat simulé.',
      error,
    );
    const snapshot = this.persistDraftLocally(draft);
    const fallback = this.handleCompletionResponse({
      sessionId: snapshot.sessionId,
      budgetId: `simulated-budget-${Date.now()}`,
      createdAt: snapshot.updatedAt,
    });
    return of(fallback).pipe(delay(this.offlineDelay));
  }

  private persistDraftLocally(draft: AssistantDraft): AssistantDraftStorageSnapshot {
    const sanitized = this.sanitizeDraft(draft);
    const snapshot: AssistantDraftStorageSnapshot = {
      sessionId: this.ensureSessionId(),
      updatedAt: new Date().toISOString(),
      draft: sanitized,
    };
    this.sessionId = snapshot.sessionId;
    this.writeDraftToStorage(snapshot);
    return snapshot;
  }

  private sanitizeDraft(draft: Partial<AssistantDraft> | undefined): AssistantDraft {
    const incomesSource = Array.isArray(draft?.incomes)
      ? (draft?.incomes as Partial<AssistantSetupIncome>[])
      : [];
    const expensesSource = Array.isArray(draft?.expenses)
      ? (draft?.expenses as Partial<AssistantSetupExpense>[])
      : [];

    return {
      step: this.normalizeStep(draft?.step),
      profile: this.normalizeProfile(draft?.profile),
      incomes: incomesSource.map((income) => this.normalizeIncome(income)),
      expenses: expensesSource.map((expense) => this.normalizeExpense(expense)),
    };
  }

  private normalizeStep(step: unknown): AssistantWizardStep {
    if (VALID_STEPS.includes(step as AssistantWizardStep)) {
      return step as AssistantWizardStep;
    }
    return 'profile';
  }

  private normalizeProfile(
    profile: Partial<AssistantSetupProfile> | undefined,
  ): AssistantSetupProfile {
    const defaultProfile: AssistantSetupProfile = {
      profileType: 'solo',
      householdSize: 1,
      monthlySavingsGoal: 0,
      currency: 'EUR',
    };

    if (!profile) {
      return defaultProfile;
    }

    const profileType = VALID_PROFILE_TYPES.includes(
      profile.profileType as AssistantProfileType,
    )
      ? (profile.profileType as AssistantProfileType)
      : defaultProfile.profileType;

    const householdSize = this.normalizeInteger(
      profile.householdSize,
      1,
      12,
      defaultProfile.householdSize,
    );

    const monthlySavingsGoal = this.normalizeAmount(profile.monthlySavingsGoal);

    const currency =
      typeof profile.currency === 'string' && profile.currency.trim().length > 0
        ? profile.currency.trim()
        : defaultProfile.currency;

    return {
      profileType,
      householdSize,
      monthlySavingsGoal,
      currency,
    };
  }

  private normalizeIncome(
    income: Partial<AssistantSetupIncome> | undefined,
  ): AssistantSetupIncome {
    return {
      label: typeof income?.label === 'string' ? income.label.trim() : '',
      amount: this.normalizeAmount(income?.amount),
      frequency: this.normalizeStringValue(
        income?.frequency,
        VALID_INCOME_FREQUENCIES,
        'monthly',
      ),
    };
  }

  private normalizeExpense(
    expense: Partial<AssistantSetupExpense> | undefined,
  ): AssistantSetupExpense {
    return {
      label: typeof expense?.label === 'string' ? expense.label.trim() : '',
      amount: this.normalizeAmount(expense?.amount),
      category: this.normalizeStringValue(
        expense?.category,
        VALID_EXPENSE_CATEGORIES,
        'other',
      ),
      recurrence: this.normalizeStringValue(
        expense?.recurrence,
        VALID_EXPENSE_RECURRENCES,
        'variable',
      ),
    };
  }

  private normalizeAmount(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value ?? 0);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return Math.max(0, Math.round(numeric * 100) / 100);
  }

  private normalizeInteger(
    value: unknown,
    min: number,
    max: number,
    fallback: number,
  ): number {
    const numeric = Math.trunc(typeof value === 'number' ? value : Number(value ?? fallback));
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.min(Math.max(numeric, min), max);
  }

  private normalizeStringValue<T extends string>(
    value: unknown,
    allowed: readonly T[],
    fallback: T,
  ): T {
    return allowed.includes(value as T) ? (value as T) : fallback;
  }

  private normalizeCompletionResponse(
    response: Partial<AssistantCompletionResponse>,
  ): AssistantCompletionResponse {
    const sessionId =
      typeof response.sessionId === 'string' && response.sessionId.trim().length > 0
        ? response.sessionId
        : this.ensureSessionId();

    const budgetId =
      typeof response.budgetId === 'string' && response.budgetId.trim().length > 0
        ? response.budgetId
        : `budget-${Math.random().toString(36).slice(2, 10)}`;

    const createdAt =
      typeof response.createdAt === 'string' && response.createdAt.trim().length > 0
        ? response.createdAt
        : new Date().toISOString();

    return { sessionId, budgetId, createdAt };
  }

  private ensureSessionId(): string {
    if (this.sessionId) {
      return this.sessionId;
    }

    const cached = this.readDraftFromStorage();
    if (cached) {
      this.sessionId = cached.sessionId;
      return cached.sessionId;
    }

    const generated = this.generateSessionId();
    this.sessionId = generated;
    return generated;
  }

  private resolveSessionId(sessionId: string | null | undefined): string {
    if (typeof sessionId === 'string' && sessionId.trim().length > 0) {
      return sessionId;
    }
    return this.ensureSessionId();
  }

  private resolveUpdatedAt(updatedAt: string | null | undefined): string {
    if (typeof updatedAt === 'string' && updatedAt.trim().length > 0) {
      return updatedAt;
    }
    return new Date().toISOString();
  }

  private generateSessionId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `assistant_${Math.random().toString(36).slice(2, 11)}`;
  }

  private readDraftFromStorage(): AssistantDraftStorageSnapshot | null {
    const storage = this.getStorage();
    if (!storage) {
      return null;
    }

    const raw = storage.getItem(ASSISTANT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<AssistantDraftStorageSnapshot>;
      const sessionId =
        typeof parsed?.sessionId === 'string' ? parsed.sessionId : null;
      const updatedAt =
        typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null;
      const draft = parsed?.draft ? this.sanitizeDraft(parsed.draft) : null;

      if (!sessionId || !updatedAt || !draft) {
        return null;
      }

      return { sessionId, updatedAt, draft };
    } catch (parseError: unknown) {
      storage.removeItem(ASSISTANT_STORAGE_KEY);
      console.warn(
        'Impossible de lire le brouillon de l’assistant dans le stockage local. Réinitialisation.',
        parseError,
      );
      return null;
    }
  }

  private writeDraftToStorage(snapshot: AssistantDraftStorageSnapshot): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (storageError: unknown) {
      console.warn(
        'Impossible d’enregistrer le brouillon de l’assistant dans le stockage local.',
        storageError,
      );
    }
  }

  private clearDraftStorage(): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.removeItem(ASSISTANT_STORAGE_KEY);
    } catch (storageError: unknown) {
      console.warn(
        'Impossible de supprimer le brouillon de l’assistant dans le stockage local.',
        storageError,
      );
    }
  }

  private getStorage(): Storage | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  private isNotFoundError(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 404;
  }
}
