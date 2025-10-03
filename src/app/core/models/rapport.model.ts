export interface ResumeFinancier {
  totalRevenus: number;
  totalDepenses: number;
  solde: number;
}

export interface RapportCategorieMontant {
  categorie: string;
  montant: number;
}

export interface RapportPeriodeMontant {
  date: string;
  montant: number;
}
