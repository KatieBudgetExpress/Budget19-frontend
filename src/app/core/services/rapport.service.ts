import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  RapportCategorieMontant,
  RapportPeriodeMontant,
  ResumeFinancier,
} from '../models/rapport.model';

@Injectable({
  providedIn: 'root',
})
export class RapportService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/rapports';

  getResume(): Observable<ResumeFinancier> {
    return this.http.get<ResumeFinancier>(this.buildUrl('resume'));
  }

  getDepensesParCategorie(): Observable<RapportCategorieMontant[]> {
    return this.http.get<RapportCategorieMontant[]>(
      this.buildUrl('depenses/categorie'),
    );
  }

  getRevenusParPeriode(): Observable<RapportPeriodeMontant[]> {
    return this.http.get<RapportPeriodeMontant[]>(
      this.buildUrl('revenus/periode'),
    );
  }

  getDepensesParPeriode(): Observable<RapportPeriodeMontant[]> {
    return this.http.get<RapportPeriodeMontant[]>(
      this.buildUrl('depenses/periode'),
    );
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl}/${path}`;
  }
}
