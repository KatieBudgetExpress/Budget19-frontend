import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type AssistantStepId = 'profil' | 'revenus' | 'depenses' | 'confirmation';

export interface AssistantProfile {
  profileType: string;
  objective: string;
  budgetName: string;
  currency: string;
  period: string;
  startDate: string;
  notes?: string;
}

export interface AssistantIncome {
  source: string;
  amount: number;
  frequency: string;
}

export interface AssistantExpense {
  label: string;
  category: string;
  amount: number;
  frequency: string;
}

export interface AssistantConfirmation {
  confirmCreation: boolean;
  notifyTeam: boolean;
  notes?: string;
}

export interface AssistantProgress {
  sessionId: string;
  currentStep: AssistantStepId;
  status: 'en-cours' | 'termine';
  profile?: AssistantProfile;
  incomes?: AssistantIncome[];
  expenses?: AssistantExpense[];
  confirmation?: AssistantConfirmation;
  createdBudgetId?: string;
}

export interface AssistantStepPayload<T = unknown> {
  sessionId: string | null;
  step: AssistantStepId;
  data: T;
}

export interface AssistantCompletionPayload {
  sessionId: string | null;
  profile: AssistantProfile;
  incomes: AssistantIncome[];
  expenses: AssistantExpense[];
  confirmation: AssistantConfirmation;
}

@Injectable({
  providedIn: 'root',
})
export class AssistantService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/assistant';

  demarrerAssistant(): Observable<AssistantProgress> {
    return this.http.post<AssistantProgress>(`${this.baseUrl}/demarrer`, {});
  }

  sauvegarderEtape<T = unknown>(
    payload: AssistantStepPayload<T>,
  ): Observable<AssistantProgress> {
    return this.http.post<AssistantProgress>(`${this.baseUrl}/etapes`, payload);
  }

  terminerAssistant(payload: AssistantCompletionPayload): Observable<AssistantProgress> {
    return this.http.post<AssistantProgress>(`${this.baseUrl}/terminer`, payload);
  }
}
