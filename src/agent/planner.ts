/**
 * Planner — produces a stepwise plan before execution and tracks
 * task completion.
 *
 * Used by the `/plan` and `/todo` CLI commands, and optionally
 * injected into the agent loop for plan-driven execution.
 */

export interface PlanStep {
  id: number;
  description: string;
  status: 'pending' | 'in_progress' | 'done' | 'skipped';
  result?: string;
}

export interface Plan {
  objective: string;
  steps: PlanStep[];
  createdAt: string;
}

export class Planner {
  private currentPlan: Plan | null = null;

  getCurrentPlan(): Plan | null {
    return this.currentPlan;
  }

  /**
   * Parse a plan from the model's response text.
   * Expects numbered lines like:
   *   1. Read the config file
   *   2. Edit the handler function
   *   3. Run the tests
   */
  parsePlan(objective: string, modelText: string): Plan {
    const lines = modelText.split('\n');
    const steps: PlanStep[] = [];
    let stepId = 1;

    for (const line of lines) {
      // Match "1. ...", "1) ...", "- ..." style
      const match = line.match(/^\s*(?:\d+[.)]\s*|-\s+)(.+)$/);
      if (match && match[1].trim().length > 0) {
        steps.push({
          id: stepId++,
          description: match[1].trim(),
          status: 'pending',
        });
      }
    }

    // If no structured steps found, treat the whole text as one step
    if (steps.length === 0) {
      steps.push({
        id: 1,
        description: modelText.trim().slice(0, 200),
        status: 'pending',
      });
    }

    this.currentPlan = {
      objective,
      steps,
      createdAt: new Date().toISOString(),
    };

    return this.currentPlan;
  }

  /**
   * Set a specific plan (e.g. from session restore).
   */
  setPlan(plan: Plan): void {
    this.currentPlan = plan;
  }

  /**
   * Mark the next pending step as in_progress.
   */
  advanceStep(): PlanStep | null {
    if (!this.currentPlan) return null;
    const next = this.currentPlan.steps.find((s) => s.status === 'pending');
    if (next) {
      next.status = 'in_progress';
    }
    return next ?? null;
  }

  /**
   * Mark the current in_progress step as done.
   */
  completeCurrentStep(result?: string): void {
    if (!this.currentPlan) return;
    const current = this.currentPlan.steps.find(
      (s) => s.status === 'in_progress',
    );
    if (current) {
      current.status = 'done';
      current.result = result;
    }
  }

  /**
   * Skip the current in_progress step.
   */
  skipCurrentStep(): void {
    if (!this.currentPlan) return;
    const current = this.currentPlan.steps.find(
      (s) => s.status === 'in_progress',
    );
    if (current) {
      current.status = 'skipped';
    }
  }

  /**
   * Format the plan for display.
   */
  formatPlan(): string {
    if (!this.currentPlan) return '  No active plan.';

    const lines: string[] = [];
    lines.push(`  Objective: ${this.currentPlan.objective}`);
    lines.push('');

    for (const step of this.currentPlan.steps) {
      let icon: string;
      switch (step.status) {
        case 'done':
          icon = '[x]';
          break;
        case 'in_progress':
          icon = '[>]';
          break;
        case 'skipped':
          icon = '[-]';
          break;
        default:
          icon = '[ ]';
      }
      lines.push(`  ${icon} ${step.id}. ${step.description}`);
      if (step.result) {
        lines.push(`       ${step.result}`);
      }
    }

    const done = this.currentPlan.steps.filter(
      (s) => s.status === 'done',
    ).length;
    const total = this.currentPlan.steps.length;
    lines.push('');
    lines.push(`  Progress: ${done}/${total}`);

    return lines.join('\n');
  }

  /**
   * Build a context string for the model about the current plan.
   */
  formatPlanForContext(): string {
    if (!this.currentPlan) return '';

    const steps = this.currentPlan.steps
      .map((s) => {
        const marker =
          s.status === 'done'
            ? '[DONE]'
            : s.status === 'in_progress'
              ? '[CURRENT]'
              : s.status === 'skipped'
                ? '[SKIPPED]'
                : '[TODO]';
        return `${marker} ${s.id}. ${s.description}`;
      })
      .join('\n');

    return `\n=== Active Plan ===\nObjective: ${this.currentPlan.objective}\n${steps}\n\nFollow this plan. Work on the [CURRENT] step. When done, move to the next step.\n`;
  }

  /**
   * Check if the plan is fully complete.
   */
  isComplete(): boolean {
    if (!this.currentPlan) return true;
    return this.currentPlan.steps.every(
      (s) => s.status === 'done' || s.status === 'skipped',
    );
  }

  /**
   * Clear the current plan.
   */
  clear(): void {
    this.currentPlan = null;
  }
}
