import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';
import {
  ConciliationMatchResponse,
  ConciliationOperation,
  ConciliationResult,
  ConciliationStatement,
} from '../../core/models/conciliation.model';
import { ConciliationService } from '../../core/services/conciliation.service';

type ConciliationStepKey = 'import' | 'automatic' | 'manual' | 'confirmation';

interface ConciliationStepDefinition {
  key: ConciliationStepKey;
  label: string;
  description: string;
}

interface ManualOperationDecision {
  operation: ConciliationOperation;
  include: boolean;
  transactionId?: string | null;
  notes: string;
}

@Component({
  standalone: true,
  selector: 'budget19-conciliation',
  templateUrl: './conciliation.component.html',
  styleUrls: ['./conciliation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class ConciliationComponent {
  private readonly conciliationService = inject(ConciliationService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly steps: ConciliationStepDefinition[] = [
    {
      key: 'import',
      label: 'Import du relevé',
      description: 'Chargez le fichier bancaire à concilier.',
    },
    {
      key: 'automatic',
      label: 'Rapprochement automatique',
      description: 'Associez automatiquement les opérations détectées.',
    },
    {
      key: 'manual',
      label: 'Validation manuelle',
      description: 'Complétez et ajustez les rapprochements restants.',
    },
    {
      key: 'confirmation',
      label: 'Confirmation',
      description: 'Confirmez et archivez la conciliation.',
    },
  ];

  readonly currentStepIndex = signal(0);
  readonly selectedFile = signal<File | null>(null);
  readonly selectedFileName = signal<string | null>(null);

  readonly statement = signal<ConciliationStatement | null>(null);
  readonly automaticMatches = signal<ConciliationOperation[]>([]);
  readonly unmatchedOperations = signal<ConciliationOperation[]>([]);
  readonly manualDecisions = signal<ManualOperationDecision[]>([]);
  readonly manualComment = signal<string>('');
  readonly finalComment = signal<string>('');
  readonly acknowledgement = signal<boolean>(true);
  readonly finalResult = signal<ConciliationResult | null>(null);

  readonly isImporting = signal(false);
  readonly isMatching = signal(false);
  readonly isValidating = signal(false);

  readonly importError = signal<string | null>(null);
  readonly matchError = signal<string | null>(null);
  readonly validationError = signal<string | null>(null);

  readonly autoMatchExecuted = signal(false);

  readonly currentStep = computed(
    () => this.steps[this.currentStepIndex()] ?? this.steps[0],
  );

  readonly progress = computed(() => {
    const totalSteps = this.steps.length;
    if (totalSteps <= 1) {
      return 100;
    }
    return (this.currentStepIndex() / (totalSteps - 1)) * 100;
  });

  readonly autoMatchSummary = computed(() => {
    const matches = this.automaticMatches();
    const unmatched = this.unmatchedOperations();
    const total = matches.length + unmatched.length;
    const rate = total > 0 ? Math.round((matches.length / total) * 100) : 0;
    return {
      total,
      matched: matches.length,
      unmatched: unmatched.length,
      rate,
    };
  });

  readonly manualSelectionStats = computed(() => {
    const decisions = this.manualDecisions();
    const included = decisions.filter((decision) => decision.include).length;
    const pending = decisions.filter(
      (decision) => !decision.include && decision.notes.trim().length === 0,
    ).length;
    return {
      total: decisions.length,
      included,
      pending,
    };
  });

  readonly isManualStepComplete = computed(() => {
    const stats = this.manualSelectionStats();
    if (stats.total === 0) {
      return true;
    }
    return stats.pending === 0;
  });

  readonly canSubmitFinal = computed(() => {
    if (this.isValidating()) {
      return false;
    }
    if (!this.acknowledgement()) {
      return false;
    }
    if (!this.statement()) {
      return false;
    }
    if (!this.autoMatchExecuted()) {
      return false;
    }
    if (!this.isManualStepComplete()) {
      return false;
    }
    return true;
  });

  readonly confirmationSummary = computed(() => {
    const statement = this.statement();
    const autoMatches = this.automaticMatches();
    const manualDecisions = this.manualDecisions();
    const manualIncluded = manualDecisions.filter((decision) => decision.include);
    const manualIgnored = manualDecisions.filter((decision) => !decision.include);
    const totalOperations =
      statement?.operations?.length ??
      autoMatches.length + manualDecisions.length;

    return {
      statement,
      totalOperations,
      autoMatchesCount: autoMatches.length,
      manualIncludedCount: manualIncluded.length,
      manualIgnoredCount: manualIgnored.length,
      manualComment: this.manualComment(),
      manualIncluded,
      manualIgnored,
    };
  });

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (!input?.files?.length) {
      this.selectedFile.set(null);
      this.selectedFileName.set(null);
      return;
    }

    const file = input.files[0] ?? null;
    this.selectedFile.set(file);
    this.selectedFileName.set(file?.name ?? null);
    this.importError.set(null);
  }

  startImport(event: Event): void {
    event.preventDefault();

    const file = this.selectedFile();
    if (!file) {
      this.importError.set('Veuillez sélectionner un relevé bancaire à importer.');
      return;
    }

    this.isImporting.set(true);
    this.importError.set(null);
    this.matchError.set(null);
    this.validationError.set(null);
    this.finalResult.set(null);

    this.conciliationService
      .importerReleve(file)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isImporting.set(false)),
      )
      .subscribe({
        next: (response) => {
          const statement = response as ConciliationStatement;
          this.statement.set(statement);
          this.currentStepIndex.set(1);
          this.autoMatchExecuted.set(false);
          this.automaticMatches.set([]);
          this.unmatchedOperations.set(statement.operations ? [...statement.operations] : []);
          this.manualDecisions.set([]);
          this.manualComment.set('');
          this.finalComment.set('');
          this.acknowledgement.set(true);
          this.finalResult.set(null);
          this.notifications.success('Relevé bancaire importé avec succès.');
          this.selectedFile.set(null);
        },
        error: (error) => {
          this.importError.set(
            'Impossible d’importer le relevé bancaire pour le moment. Veuillez réessayer plus tard.',
          );
          this.notifications.error(
            'Le fichier de relevé n’a pas pu être importé. Vérifiez son format et réessayez.',
          );
          console.error('Failed to import statement', error);
        },
      });
  }

  launchAutomaticReconciliation(): void {
    const statement = this.statement();
    if (!statement) {
      return;
    }

    this.isMatching.set(true);
    this.matchError.set(null);
    this.finalResult.set(null);

    const payload = {
      statementId: statement.id,
      operations: statement.operations ?? [],
    };

    this.conciliationService
      .rapprocherOperations(payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isMatching.set(false)),
      )
      .subscribe({
        next: (response) => {
          const result = response as ConciliationMatchResponse;
          const nextStatement = result.statement ?? statement;
          this.statement.set(nextStatement);

          const matched = result.matchedOperations ?? [];
          const unmatched = result.unmatchedOperations ?? [];

          this.automaticMatches.set([...matched]);
          this.unmatchedOperations.set([...unmatched]);
          this.manualDecisions.set(
            unmatched.map((operation) => ({
              operation,
              include: false,
              transactionId: operation.matchedTransactionId ?? null,
              notes: '',
            })),
          );
          this.autoMatchExecuted.set(true);
          this.notifications.success('Rapprochement automatique terminé.');
        },
        error: (error) => {
          this.matchError.set(
            'Le rapprochement automatique n’a pas pu être exécuté. Réessayez dans quelques instants.',
          );
          this.notifications.error(
            'Impossible de lancer le rapprochement automatique sur ce relevé.',
          );
          console.error('Automatic reconciliation failed', error);
        },
      });
  }

  goToManualStep(): void {
    if (!this.autoMatchExecuted()) {
      return;
    }
    this.currentStepIndex.set(2);
  }

  proceedToConfirmation(): void {
    if (!this.isManualStepComplete()) {
      this.notifications.warning(
        'Complétez les décisions manuelles avant de continuer vers la confirmation.',
      );
      return;
    }
    this.currentStepIndex.set(3);
  }

  navigateToStep(index: number): void {
    if (!this.canAccessStep(index)) {
      return;
    }
    this.currentStepIndex.set(index);
  }

  canAccessStep(index: number): boolean {
    if (index < 0 || index >= this.steps.length) {
      return false;
    }
    if (index <= this.currentStepIndex()) {
      return true;
    }

    switch (index) {
      case 1:
        return !!this.statement();
      case 2:
        return this.autoMatchExecuted();
      case 3:
        return this.autoMatchExecuted() && this.isManualStepComplete();
      default:
        return false;
    }
  }

  isStepActive(index: number): boolean {
    return index === this.currentStepIndex();
  }

  isStepCompleted(index: number): boolean {
    if (index === 0) {
      return this.currentStepIndex() > 0 && !!this.statement();
    }
    if (index === 1) {
      return this.currentStepIndex() > 1 && this.autoMatchExecuted();
    }
    if (index === 2) {
      return this.currentStepIndex() > 2 && this.isManualStepComplete();
    }
    if (index === 3) {
      return !!this.finalResult();
    }
    return false;
  }

  onManualDecisionToggle(operationId: string, include: boolean): void {
    this.manualDecisions.update((decisions) =>
      decisions.map((decision) =>
        decision.operation.id === operationId ? { ...decision, include } : decision,
      ),
    );
  }

  onManualTransactionChange(operationId: string, value: string): void {
    const trimmed = value.trim();
    this.manualDecisions.update((decisions) =>
      decisions.map((decision) =>
        decision.operation.id === operationId
          ? { ...decision, transactionId: trimmed || null }
          : decision,
      ),
    );
  }

  onManualNoteChange(operationId: string, value: string): void {
    this.manualDecisions.update((decisions) =>
      decisions.map((decision) =>
        decision.operation.id === operationId ? { ...decision, notes: value } : decision,
      ),
    );
  }

  onManualCommentChange(value: string): void {
    this.manualComment.set(value);
  }

  onAcknowledgeChange(value: boolean): void {
    this.acknowledgement.set(value);
  }

  onFinalCommentChange(value: string): void {
    this.finalComment.set(value);
  }

  submitFinalValidation(event: Event): void {
    event.preventDefault();

    if (!this.canSubmitFinal()) {
      if (!this.acknowledgement()) {
        this.notifications.warning(
          'Vous devez attester de l’exactitude de la conciliation avant de confirmer.',
        );
      }
      return;
    }

    const statement = this.statement();
    if (!statement) {
      return;
    }

    const automaticMatches = this.automaticMatches();
    const manualDecisions = this.manualDecisions();

    const payload = {
      statementId: statement.id,
      automaticMatches: automaticMatches.map((operation) => ({
        operationId: operation.id,
        transactionId: operation.matchedTransactionId ?? null,
        amount: operation.amount,
        label: operation.label,
      })),
      manualDecisions: manualDecisions.map((decision) => ({
        operationId: decision.operation.id,
        include: decision.include,
        transactionId: decision.transactionId ?? null,
        notes: decision.notes.trim() || null,
      })),
      comments: {
        manual: this.manualComment().trim() || null,
        final: this.finalComment().trim() || null,
      },
      acknowledgement: this.acknowledgement(),
    };

    this.isValidating.set(true);
    this.validationError.set(null);

    this.conciliationService
      .validerConciliation(payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isValidating.set(false)),
      )
      .subscribe({
        next: (response) => {
          const result = response as ConciliationResult;
          this.finalResult.set(result);
          this.notifications.success('Conciliation bancaire confirmée et archivée.');
        },
        error: (error) => {
          this.validationError.set(
            'La confirmation finale a échoué. Aucune donnée n’a été modifiée.',
          );
          this.notifications.error(
            'La conciliation n’a pas pu être confirmée. Vérifiez les informations et réessayez.',
          );
          console.error('Failed to validate conciliation', error);
        },
      });
  }

  trackByMatchedOperation(_index: number, operation: ConciliationOperation): string {
    return operation.id;
  }

  trackByManualDecision(_index: number, decision: ManualOperationDecision): string {
    return decision.operation.id;
  }
}
