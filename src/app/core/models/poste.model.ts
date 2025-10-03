export interface PosteBudgetaire {
  id: number;
  nom: string;
  description?: string;
  montant: number;
  categorie: string;
  dateDebut?: string;
  dateFin?: string;
}

export type CreatePostePayload = Omit<PosteBudgetaire, 'id'>;
export type UpdatePostePayload = Partial<CreatePostePayload>;
