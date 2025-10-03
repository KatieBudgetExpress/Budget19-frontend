import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Poste {
  id: number;
  name: string;
  description?: string;
  amount: number;
  category: string;
  dateDebut?: string;
  dateFin?: string;
}

export type PosteBudgetaire = Poste;
export type CreatePostePayload = Omit<Poste, 'id'>;
export type UpdatePostePayload = Partial<CreatePostePayload>;

@Injectable({
  providedIn: 'root',
})
export class PosteService {
  private readonly baseUrl = '/api/postes';

  constructor(private readonly http: HttpClient) {}

  list(): Observable<PosteBudgetaire[]> {
    return this.http.get<PosteBudgetaire[]>(this.baseUrl);
  }

  getById(id: number): Observable<PosteBudgetaire> {
    return this.http.get<PosteBudgetaire>(`${this.baseUrl}/${id}`);
  }

  create(payload: CreatePostePayload): Observable<PosteBudgetaire> {
    return this.http.post<PosteBudgetaire>(this.baseUrl, payload);
  }

  update(id: number, payload: UpdatePostePayload): Observable<PosteBudgetaire> {
    return this.http.patch<PosteBudgetaire>(`${this.baseUrl}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
