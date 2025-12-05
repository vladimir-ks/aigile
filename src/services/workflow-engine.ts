/**
 * Workflow Validation Engine
 *
 * Enforces valid status transitions for all entity types.
 * Based on JIRA-like workflow conventions.
 *
 * @author Vladimir K.S.
 */

export type WorkflowEntityType = 'initiative' | 'epic' | 'story' | 'task' | 'bug' | 'sprint' | 'version';

export interface TransitionResult {
  valid: boolean;
  error?: string;
  validTransitions?: string[];
}

/**
 * Valid status transitions per entity type.
 * Map from current status to array of valid target statuses.
 */
const WORKFLOWS: Record<WorkflowEntityType, Record<string, string[]>> = {
  initiative: {
    draft: ['active'],
    active: ['draft', 'done'],
    done: ['active', 'archived'],
    archived: []
  },

  epic: {
    backlog: ['analysis'],
    analysis: ['backlog', 'ready'],
    ready: ['in_progress'],
    in_progress: ['backlog', 'done'],
    done: ['in_progress', 'closed'],
    closed: []
  },

  story: {
    backlog: ['selected'],
    selected: ['backlog', 'in_progress'],
    in_progress: ['backlog', 'in_review'],
    in_review: ['in_progress', 'done'],
    done: ['in_progress', 'closed'],
    closed: []
  },

  task: {
    todo: ['in_progress'],
    in_progress: ['todo', 'in_review', 'blocked'],
    blocked: ['in_progress'],
    in_review: ['in_progress', 'done'],
    done: ['in_progress']
  },

  bug: {
    open: ['in_progress'],
    in_progress: ['open', 'resolved'],
    resolved: ['reopened', 'closed'],
    reopened: ['in_progress', 'closed'],
    closed: []
  },

  sprint: {
    future: ['active'],
    active: ['closed'],
    closed: []
  },

  version: {
    unreleased: ['released'],
    released: ['archived'],
    archived: []
  }
};

/**
 * Default (initial) status for each entity type
 */
export const DEFAULT_STATUS: Record<WorkflowEntityType, string> = {
  initiative: 'draft',
  epic: 'backlog',
  story: 'backlog',
  task: 'todo',
  bug: 'open',
  sprint: 'future',
  version: 'unreleased'
};

/**
 * All valid statuses for each entity type
 */
export function getAllStatuses(entityType: WorkflowEntityType): string[] {
  const workflow = WORKFLOWS[entityType];
  if (!workflow) {
    return [];
  }
  return Object.keys(workflow);
}

/**
 * Check if a status is valid for an entity type
 */
export function isValidStatus(entityType: WorkflowEntityType, status: string): boolean {
  const workflow = WORKFLOWS[entityType];
  if (!workflow) {
    return false;
  }
  return status in workflow;
}

/**
 * Get valid transitions from the current status
 */
export function getValidTransitions(entityType: WorkflowEntityType, currentStatus: string): string[] {
  const workflow = WORKFLOWS[entityType];
  if (!workflow) {
    return [];
  }
  return workflow[currentStatus] ?? [];
}

/**
 * Validate a status transition
 *
 * @param entityType - Type of entity (initiative, epic, story, task, bug, sprint, version)
 * @param currentStatus - Current status of the entity
 * @param newStatus - Target status to transition to
 * @returns TransitionResult with validation result
 */
export function validateTransition(
  entityType: WorkflowEntityType,
  currentStatus: string,
  newStatus: string
): TransitionResult {
  const workflow = WORKFLOWS[entityType];

  if (!workflow) {
    return {
      valid: false,
      error: `Unknown entity type: ${entityType}`
    };
  }

  // Check if current status is valid
  if (!(currentStatus in workflow)) {
    return {
      valid: false,
      error: `Invalid current status "${currentStatus}" for ${entityType}`,
      validTransitions: []
    };
  }

  // Check if new status is valid for this entity type
  if (!(newStatus in workflow)) {
    return {
      valid: false,
      error: `Invalid target status "${newStatus}" for ${entityType}`,
      validTransitions: workflow[currentStatus]
    };
  }

  // Same status - no transition needed
  if (currentStatus === newStatus) {
    return { valid: true };
  }

  // Check if transition is allowed
  const validTransitions = workflow[currentStatus];
  if (!validTransitions.includes(newStatus)) {
    return {
      valid: false,
      error: `Cannot transition ${entityType} from "${currentStatus}" to "${newStatus}"`,
      validTransitions
    };
  }

  return { valid: true };
}

/**
 * Format transition error message for CLI output
 */
export function formatTransitionError(
  entityType: WorkflowEntityType,
  key: string,
  currentStatus: string,
  newStatus: string,
  validTransitions: string[]
): string {
  const validStr = validTransitions.length > 0
    ? validTransitions.join(', ')
    : '(none - terminal status)';

  return `Cannot transition ${entityType} "${key}" from "${currentStatus}" to "${newStatus}".\n` +
    `Valid transitions from "${currentStatus}": ${validStr}`;
}

/**
 * Check if entity type supports workflow validation
 */
export function hasWorkflow(entityType: string): entityType is WorkflowEntityType {
  return entityType in WORKFLOWS;
}

/**
 * Get workflow definition for an entity type
 */
export function getWorkflow(entityType: WorkflowEntityType): Record<string, string[]> | null {
  return WORKFLOWS[entityType] ?? null;
}
