export interface Transaction {
  id: string;
  date: string;
  libelle: string;
  montant: number;
  categorie: string;
  type: 'revenu' | 'depense' | 'transfert';
}

export type CreateTransactionPayload = Omit<Transaction, 'id'>;

export type UpdateTransactionPayload = Partial<CreateTransactionPayload>;
