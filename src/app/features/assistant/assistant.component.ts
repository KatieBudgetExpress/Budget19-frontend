import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Signal,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Subject,
  catchError,
  concatMap,
  debounceTime,
  filter,
  finalize,
  merge,
  tap,
} from 'rxjs';
import { AssistantService } from '../../core/services/assistant.service';

type AssistantWizardStep = 'profile' | 'incomes' | 'expenses' | 'confirmation';
type SaveOrigin = 'auto' | 'navigation';

type IncomeFrequency = 'monthly' | 'quarterly' | 'yearly' | 'punctual';
type ExpenseRecurrence = 'fixed' | 'variable';
type ExpenseCategory =
  | 'housing'
  | 'transport'
  | 'food'
  | 'health'
  | 'leisure'
  | 'education'
  | 'savings'
  | 'other';

type HouseholdProfile = 'solo' | 'couple' | 'family' | 'custom';

interface AssistantProfile {
  profileType: HouseholdProfile;
  householdSize: number;
  monthlySavingsGoal: number;
  currency: string;
}

interface AssistantIncome {
  label: string;
  amount: number;
  frequency: IncomeFrequency;
}

interface AssistantExpense {
  label: string;
  amount: number;
  category: ExpenseCategory;
  recurrence: ExpenseRecurrence;
}

interface AssistantDraft {
  step: AssistantWizardStep;
  profile: AssistantProfile;
  incomes: AssistantIncome[];
  expenses: AssistantExpense[];
}

interface WizardStepDefinition {
  key: AssistantWizardStep;
  label: string;
  description: string;
}

interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface SaveRequest {
  origin: SaveOrigin;
  step: AssistantWizardStep;
}

type IncomeFormGroup = FormGroup<{
  label: FormControl<string>;
  amount: FormControl<number>;
  frequency: FormControl<IncomeFrequency>;
}>;

type ExpenseFormGroup = FormGroup<{
  label: FormControl<string>;
  amount: FormControl<number>;
  category: FormControl<ExpenseCategory>;
  recurrence: FormControl<ExpenseRecurrence>;
}>;

const DEFAULT_PROFILE: AssistantProfile = {
  profileType: 'solo',
  householdSize: 1,
  monthlySavingsGoal: 0,
  currency: 'EUR',
};

const WIZARD_STEPS: WizardStepDefinition[] = [
  {
    key: 'profile',
    label: 'Profil',
    description: 'Sélectionnez le profil budgétaire qui correspond à votre foyer.',
  },
  {
    key: 'incomes',
    label: 'Revenus',
    description: 'Renseignez toutes vos sources de revenus pour le budget.',
  },
  {
    key: 'expenses',
    label: 'Dépenses',
    description: 'Ajoutez les charges principales et récurrentes à couvrir.',
  },
  {
    key: 'confirmation',
    label: 'Confirmation',
    description: 'Vérifiez le résumé avant de valider la configuration.',
  },
];

const PROFILE_OPTIONS: SelectOption<HouseholdProfile>[] = [
  {
    value: 'solo',
    label: 'Solo',
    description: 'Vous gérez un budget individuel ou un foyer d’une personne.',
  },
  {
    value: 'couple',
    label: 'Couple',
    description: 'Vous souhaitez suivre les finances de votre couple.',
  },
  {
    value: 'family',
    label: 'Famille',
    description: 'Vous prenez en compte un foyer familial avec enfants.',
  },
  {
    value: 'custom',
    label: 'Personnalisé',
    description: 'Définissez un profil spécifique à votre situation.',
  },
];

const INCOME_FREQUENCIES: SelectOption<IncomeFrequency>[] = [
  { value: 'monthly', label: 'Mensuel', description: 'Versé chaque mois.' },
  { value: 'quarterly', label: 'Trimestriel', description: 'Versé tous les trois mois.' },
  { value: 'yearly', label: 'Annuel', description: 'Perçu une fois par an.' },
  { value: 'punctual', label: 'Ponctuel', description: 'Revenu exceptionnel ou irrégulier.' },
];

const EXPENSE_RECURRENCES: SelectOption<ExpenseRecurrence>[] = [
  { value: 'fixed', label: 'Fixe', description: 'Paiement récurrent et stable.' },
  { value: 'variable', label: 'Variable', description: 'Montant susceptible de varier.' },
];

const EXPENSE_CATEGORIES: SelectOption<ExpenseCategory>[] = [
  { value: 'housing', label: 'Logement' },
  { value: 'transport', label: 'Transport' },
  { value: 'food', label: 'Alimentation' },
  { value: 'health', label: 'Santé' },
  { value: 'education', label: 'Éducation' },
  { value: 'leisure', label: 'Loisirs' },
  { value: 'savings', label: 'Épargne et assurances' },
  { value: 'other', label: 'Autres dépenses' },
];

@Component({
  standalone: true,
  selector: 'budget19-assistant',
  templateUrl: './assistant.component.html',
  styleUrls: ['./assistant.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class AssistantComponent {
  private readonly fb = inject(FormBuilder);
  private readonly assistantService = inject(AssistantService);
  private readonly destroyRef = inject(DestroyRef);

  readonly steps = WIZARD_STEPS;
  readonly profileOptions = PROFILE_OPTIONS;
  readonly incomeFrequencies = INCOME_FREQUENCIES;
  readonly expenseRecurrences = EXPENSE_RECURRENCES;
  readonly expenseCategories = EXPENSE_CATEGORIES;

  private readonly profileLabels = new Map<HouseholdProfile, string>(
    PROFILE_OPTIONS.map((option) => [option.value, option.label]),
  );
  private readonly frequencyLabels = new Map<IncomeFrequency, string>(
    INCOME_FREQUENCIES.map((option) => [option.value, option.label]),
  );
  private readonly categoryLabels = new Map<ExpenseCategory, string>(
    EXPENSE_CATEGORIES.map((option) => [option.value, option.label]),
  );
  private readonly recurrenceLabels = new Map<ExpenseRecurrence, string>(
    EXPENSE_RECURRENCES.map((option) => [option.value, option.label]),
  );

  readonly currentStepIndex = signal(0);
  private readonly activeStepSignal = computed<AssistantWizardStep>(
    () => this.steps[this.currentStepIndex()]?.key ?? 'profile',
  );
  private readonly activeStepDefinitionSignal = computed(
    () => this.steps[this.currentStepIndex()] ?? this.steps[0],
  );

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasCompleted = signal(false);
  readonly lastSavedAt = signal<number | null>(null);

  private readonly incomesTotalSignal = signal(0);
  private readonly expensesTotalSignal = signal(0);
  private readonly hasIncomeEntriesSignal = signal(false);
  private readonly hasExpenseEntriesSignal = signal(false);

  readonly incomesTotal = this.incomesTotalSignal.asReadonly();
  readonly expensesTotal = this.expensesTotalSignal.asReadonly();
  readonly projectedBalance = computed(
    () => this.incomesTotalSignal() - this.expensesTotalSignal(),
  );
  readonly hasIncomeEntries = this.hasIncomeEntriesSignal.asReadonly();
  readonly hasExpenseEntries = this.hasExpenseEntriesSignal.asReadonly();

  readonly profileForm = this.fb.nonNullable.group({
    profileType: [DEFAULT_PROFILE.profileType, Validators.required],
    householdSize: [
      DEFAULT_PROFILE.householdSize,
      [Validators.required, Validators.min(1), Validators.max(12)],
    ],
    monthlySavingsGoal: [DEFAULT_PROFILE.monthlySavingsGoal, [Validators.min(0)]],
    currency: [DEFAULT_PROFILE.currency, Validators.required],
  });

  readonly incomesForm = this.fb.nonNullable.group({
    incomes: this.fb.array<IncomeFormGroup>(
      [this.createIncomeGroup()],
      [Validators.minLength(1)],
    ),
  });

  readonly expensesForm = this.fb.nonNullable.group({
    expenses: this.fb.array<ExpenseFormGroup>(
      [this.createExpenseGroup()],
      [Validators.minLength(1)],
    ),
  });

  private readonly saveRequests$ = new Subject<SaveRequest>();
  private initialized = false;

  constructor() {
    this.setupSavePipeline();
    this.registerFormListeners();
    this.updateTotals();
    this.loadInitialDraft();
  }

  get incomes(): FormArray<IncomeFormGroup> {
    return this.incomesForm.controls.incomes;
  }

  get expenses(): FormArray<ExpenseFormGroup> {
    return this.expensesForm.controls.expenses;
  }

  currentStep(): AssistantWizardStep {
    return this.activeStepSignal();
  }

  currentStepDefinition(): WizardStepDefinition {
    return this.activeStepDefinitionSignal();
  }

  nextStep(): void {
    if (this.isSaving() || this.isLastStep()) {
      return;
    }

    const current = this.currentStep();
    if (!this.validateStep(current)) {
      return;
    }

    const nextIndex = Math.min(this.currentStepIndex() + 1, this.steps.length - 1);
    this.currentStepIndex.set(nextIndex);
    this.queueSave('navigation', this.currentStep());
  }

  goToPrevious(): void {
    if (this.isSaving() || this.isFirstStep()) {
      return;
    }

    const previousIndex = Math.max(this.currentStepIndex() - 1, 0);
    this.currentStepIndex.set(previousIndex);
    this.queueSave('navigation', this.currentStep());
  }

  isFirstStep(): boolean {
    return this.currentStepIndex() === 0;
  }

  isLastStep(): boolean {
    return this.currentStepIndex() === this.steps.length - 1;
  }

  addIncome(): void {
    this.incomes.push(this.createIncomeGroup());
    this.updateTotals();
  }

  removeIncome(index: number): void {
    if (this.incomes.length <= 1 || index < 0 || index >= this.incomes.length) {
      return;
    }

    this.incomes.removeAt(index);
    this.updateTotals();
    if (this.initialized) {
      this.queueSave('auto');
    }
  }

  addExpense(): void {
    this.expenses.push(this.createExpenseGroup());
    this.updateTotals();
  }

  removeExpense(index: number): void {
    if (this.expenses.length <= 1 || index < 0 || index >= this.expenses.length) {
      return;
    }

    this.expenses.removeAt(index);
    this.updateTotals();
    if (this.initialized) {
      this.queueSave('auto');
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  getProfileLabel(value: HouseholdProfile | null | undefined): string {
    return this.profileLabels.get(value ?? DEFAULT_PROFILE.profileType) ?? '';
  }

  getFrequencyLabel(value: IncomeFrequency | null | undefined): string {
    return this.frequencyLabels.get((value ?? 'monthly') as IncomeFrequency) ?? '';
  }

  getCategoryLabel(value: ExpenseCategory | null | undefined): string {
    return this.categoryLabels.get((value ?? 'other') as ExpenseCategory) ?? '';
  }

  getRecurrenceLabel(value: ExpenseRecurrence | null | undefined): string {
    return this.recurrenceLabels.get((value ?? 'variable') as ExpenseRecurrence) ?? '';
  }

  getReviewIncomes(): AssistantIncome[] {
    return this.incomes.controls
      .map((group) => ({
        label: this.normalizeLabel(group.controls.label.value),
        amount: this.normalizeAmount(group.controls.amount.value),
        frequency: group.controls.frequency.value ?? 'monthly',
      }))
      .filter((income) => income.label.length > 0 || income.amount > 0);
  }

  getReviewExpenses(): AssistantExpense[] {
    return this.expenses.controls
      .map((group) => ({
        label: this.normalizeLabel(group.controls.label.value),
        amount: this.normalizeAmount(group.controls.amount.value),
        category: group.controls.category.value ?? 'other',
        recurrence: group.controls.recurrence.value ?? 'variable',
      }))
      .filter((expense) => expense.label.length > 0 || expense.amount > 0);
  }

  completeWizard(): void {
    if (this.isSaving() || this.hasCompleted()) {
      return;
    }

    const validations: [AssistantWizardStep, boolean][] = [
      ['profile', this.validateStep('profile')],
      ['incomes', this.validateStep('incomes')],
      ['expenses', this.validateStep('expenses')],
    ];

    const firstInvalid = validations.find(([, valid]) => !valid);
    if (firstInvalid) {
      const stepIndex = this.steps.findIndex((step) => step.key === firstInvalid[0]);
      if (stepIndex >= 0) {
        this.currentStepIndex.set(stepIndex);
      }
      return;
    }

    this.isSaving.set(true);
    this.error.set(null);

    const draft = this.buildDraft('confirmation');

    this.assistantService
      .completeSetup(draft)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSaving.set(false)),
      )
      .subscribe({
        next: () => {
          this.hasCompleted.set(true);
          this.lastSavedAt.set(Date.now());
        },
        error: (error) => {
          console.error('Impossible de finaliser la configuration budgétaire.', error);
          this.error.set(
            "La validation de l’assistant a échoué. Veuillez réessayer dans quelques instants.",
          );
        },
      });
  }

  private createIncomeGroup(income?: AssistantIncome): IncomeFormGroup {
    return this.fb.nonNullable.group({
      label: [income?.label ?? '', [Validators.required, Validators.maxLength(80)]],
      amount: [income?.amount ?? 0, [Validators.required, Validators.min(0)]],
      frequency: [income?.frequency ?? 'monthly', Validators.required],
    });
  }

  private createExpenseGroup(expense?: AssistantExpense): ExpenseFormGroup {
    return this.fb.nonNullable.group({
      label: [expense?.label ?? '', [Validators.required, Validators.maxLength(80)]],
      amount: [expense?.amount ?? 0, [Validators.required, Validators.min(0)]],
      category: [expense?.category ?? 'housing', Validators.required],
      recurrence: [expense?.recurrence ?? 'fixed', Validators.required],
    });
  }

  private setupSavePipeline(): void {
    this.saveRequests$
      .pipe(
        filter(() => this.initialized && !this.hasCompleted()),
        concatMap((request) => {
          const payload = this.buildDraft(request.step);
          const showSpinner = request.origin === 'navigation';

          if (showSpinner) {
            this.isSaving.set(true);
          }

          this.error.set(null);

          return this.assistantService.saveDraft(payload).pipe(
            tap(() => {
              this.lastSavedAt.set(Date.now());
            }),
            catchError((error) => {
              console.error('Impossible de sauvegarder la progression de l’assistant.', error);
              this.error.set(
                "Impossible de sauvegarder la progression pour le moment. Vos dernières modifications pourraient ne pas être enregistrées.",
              );
              return EMPTY;
            }),
            finalize(() => {
              if (showSpinner) {
                this.isSaving.set(false);
              }
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private registerFormListeners(): void {
    const valueChanges$ = merge(
      this.profileForm.valueChanges,
      this.incomesForm.valueChanges,
      this.expensesForm.valueChanges,
    );

    valueChanges$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.updateTotals();
      });

    valueChanges$
      .pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.initialized || this.hasCompleted()) {
          return;
        }
        this.queueSave('auto');
      });
  }

  private loadInitialDraft(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.assistantService
      .loadDraft()
      .pipe(
        finalize(() => {
          this.isLoading.set(false);
          this.initialized = true;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (draft: AssistantDraft | null) => {
          if (draft) {
            this.applyDraft(draft);
          } else {
            this.resetForms();
          }
        },
        error: (error) => {
          console.error('Impossible de charger la progression de l’assistant.', error);
          this.error.set(
            "Impossible de charger la progression précédente. Vous pouvez reprendre une configuration neuve.",
          );
          this.resetForms();
        },
      });
  }

  private applyDraft(draft: AssistantDraft): void {
    this.profileForm.reset(
      {
        profileType: draft.profile?.profileType ?? DEFAULT_PROFILE.profileType,
        householdSize: draft.profile?.householdSize ?? DEFAULT_PROFILE.householdSize,
        monthlySavingsGoal:
          draft.profile?.monthlySavingsGoal ?? DEFAULT_PROFILE.monthlySavingsGoal,
        currency: draft.profile?.currency ?? DEFAULT_PROFILE.currency,
      },
      { emitEvent: false },
    );
    this.profileForm.markAsPristine();
    this.profileForm.markAsUntouched();

    const incomeGroups = (draft.incomes?.length ? draft.incomes : [undefined]).map(
      (income) => this.createIncomeGroup(income),
    );
    this.replaceFormArray(this.incomes, incomeGroups);

    const expenseGroups = (draft.expenses?.length ? draft.expenses : [undefined]).map(
      (expense) => this.createExpenseGroup(expense),
    );
    this.replaceFormArray(this.expenses, expenseGroups);

    const stepIndex = this.steps.findIndex((step) => step.key === draft.step);
    this.currentStepIndex.set(stepIndex >= 0 ? stepIndex : 0);
    this.updateTotals();
  }

  private resetForms(): void {
    this.profileForm.reset(
      {
        profileType: DEFAULT_PROFILE.profileType,
        householdSize: DEFAULT_PROFILE.householdSize,
        monthlySavingsGoal: DEFAULT_PROFILE.monthlySavingsGoal,
        currency: DEFAULT_PROFILE.currency,
      },
      { emitEvent: false },
    );
    this.profileForm.markAsPristine();
    this.profileForm.markAsUntouched();

    this.replaceFormArray(this.incomes, [this.createIncomeGroup()]);
    this.replaceFormArray(this.expenses, [this.createExpenseGroup()]);

    this.currentStepIndex.set(0);
    this.updateTotals();
  }

  private replaceFormArray<T extends FormGroup>(
    array: FormArray<T>,
    controls: T[],
  ): void {
    while (array.length) {
      array.removeAt(array.length - 1, { emitEvent: false });
    }

    controls.forEach((control) => array.push(control, { emitEvent: false }));
    array.markAsPristine();
    array.markAsUntouched();
  }

  private buildDraft(step?: AssistantWizardStep): AssistantDraft {
    const profileRaw = this.profileForm.getRawValue();
    const normalizedHouseholdSize = Math.min(
      12,
      Math.max(1, Math.round(profileRaw.householdSize ?? DEFAULT_PROFILE.householdSize)),
    );
    const normalizedProfile: AssistantProfile = {
      profileType: profileRaw.profileType,
      householdSize: normalizedHouseholdSize,
      monthlySavingsGoal: this.normalizeAmount(profileRaw.monthlySavingsGoal),
      currency: profileRaw.currency ?? DEFAULT_PROFILE.currency,
    };

    const incomes = this.incomes.controls
      .map((group) => ({
        label: this.normalizeLabel(group.controls.label.value),
        amount: this.normalizeAmount(group.controls.amount.value),
        frequency: group.controls.frequency.value ?? 'monthly',
      }))
      .filter((income) => income.label.length > 0 || income.amount > 0);

    const expenses = this.expenses.controls
      .map((group) => ({
        label: this.normalizeLabel(group.controls.label.value),
        amount: this.normalizeAmount(group.controls.amount.value),
        category: group.controls.category.value ?? 'other',
        recurrence: group.controls.recurrence.value ?? 'variable',
      }))
      .filter((expense) => expense.label.length > 0 || expense.amount > 0);

    return {
      step: step ?? this.currentStep(),
      profile: normalizedProfile,
      incomes,
      expenses,
    };
  }

  private updateTotals(): void {
    let incomeTotal = 0;
    let hasIncomeEntry = false;

    for (const income of this.incomes.controls) {
      const amount = this.normalizeAmount(income.controls.amount.value);
      const label = this.normalizeLabel(income.controls.label.value);
      incomeTotal += amount;
      if (amount > 0 && label.length > 0) {
        hasIncomeEntry = true;
      }
    }

    let expenseTotal = 0;
    let hasExpenseEntry = false;

    for (const expense of this.expenses.controls) {
      const amount = this.normalizeAmount(expense.controls.amount.value);
      const label = this.normalizeLabel(expense.controls.label.value);
      expenseTotal += amount;
      if (amount > 0 && label.length > 0) {
        hasExpenseEntry = true;
      }
    }

    this.incomesTotalSignal.set(Math.round(incomeTotal * 100) / 100);
    this.expensesTotalSignal.set(Math.round(expenseTotal * 100) / 100);
    this.hasIncomeEntriesSignal.set(hasIncomeEntry);
    this.hasExpenseEntriesSignal.set(hasExpenseEntry);
  }

  private validateStep(step: AssistantWizardStep): boolean {
    if (step === 'profile') {
      if (this.profileForm.invalid) {
        this.profileForm.markAllAsTouched();
        return false;
      }
      return true;
    }

    if (step === 'incomes') {
      return this.validateCollection(this.incomes, this.hasIncomeEntriesSignal);
    }

    if (step === 'expenses') {
      return this.validateCollection(this.expenses, this.hasExpenseEntriesSignal);
    }

    return true;
  }

  private validateCollection(
    array: FormArray<FormGroup>,
    hasEntriesSignal: Signal<boolean>,
  ): boolean {
    array.controls.forEach((control) => control.markAllAsTouched());
    const hasEntries = hasEntriesSignal();
    return array.valid && hasEntries;
  }

  private queueSave(origin: SaveOrigin, step?: AssistantWizardStep): void {
    if (!this.initialized || this.hasCompleted()) {
      return;
    }
    const targetStep = step ?? this.currentStep();
    this.saveRequests$.next({ origin, step: targetStep });
  }

  private normalizeAmount(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value ?? 0);
    if (Number.isNaN(numeric)) {
      return 0;
    }
    return Math.max(0, Math.round(numeric * 100) / 100);
  }

  private normalizeLabel(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}
