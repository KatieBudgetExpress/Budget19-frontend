import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ConciliationMatchResponse,
  ConciliationResult,
  ConciliationStatement,
} from '../models/conciliation.model';

@Injectable({
  providedIn: 'root',
})
export class ConciliationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/conciliation';

  importerReleve(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ConciliationStatement>(`${this.baseUrl}/import`, formData);
  }

  rapprocherOperations(data: any): Observable<any> {
    return this.http.post<ConciliationMatchResponse>(`${this.baseUrl}/match`, data);
  }

  validerConciliation(data: any): Observable<any> {
    return this.http.post<ConciliationResult>(`${this.baseUrl}/validate`, data);
  }
}
