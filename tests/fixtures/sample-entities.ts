/**
 * Sample Entity Fixtures for AIGILE Tests
 *
 * @author Vladimir K.S.
 */

// Sample Initiative
export const sampleInitiative = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  key: 'INIT-1',
  summary: 'Q1 Platform Modernization',
  description: 'Migrate legacy systems to microservices architecture',
  status: 'active',
  priority: 'Highest',
  owner: 'cto@company.com',
  start_date: '2025-01-01',
  target_date: '2025-03-31',
  metadata: {},
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z'
};

// Sample Epic
export const sampleEpic = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  key: 'CCM-1',
  summary: 'User Authentication System',
  description: 'Implement OAuth2 and session management',
  initiative_id: sampleInitiative.id,
  status: 'in_progress',
  priority: 'High',
  owner: 'alice@company.com',
  reporter: 'pm@company.com',
  labels: ['security', 'mvp'],
  components: [],
  fix_versions: [],
  story_points: 21,
  start_date: '2025-01-06',
  due_date: '2025-02-28',
  persona_ids: [],
  metadata: {},
  created_at: '2025-01-06T00:00:00.000Z',
  updated_at: '2025-01-15T00:00:00.000Z'
};

// Sample Story
export const sampleStory = {
  id: '550e8400-e29b-41d4-a716-446655440003',
  key: 'CCM-2',
  epic_id: sampleEpic.id,
  summary: 'Login form with email/password',
  description: 'Create a responsive login form',
  as_a: 'returning user',
  i_want: 'to log in with my email and password',
  so_that: 'I can access my account',
  acceptance_criteria: JSON.stringify([
    {
      given: 'I am on the login page',
      when: 'I enter valid credentials and click submit',
      then: 'I should be redirected to the dashboard'
    }
  ]),
  status: 'in_progress',
  priority: 'High',
  story_points: 5,
  assignee: 'bob@company.com',
  reporter: 'alice@company.com',
  labels: ['frontend'],
  components: [],
  fix_versions: [],
  sprint_id: null,
  due_date: '2025-01-20',
  original_estimate: 8,
  remaining_estimate: 4,
  time_spent: 4,
  metadata: {},
  created_at: '2025-01-08T00:00:00.000Z',
  updated_at: '2025-01-15T00:00:00.000Z'
};

// Sample Task
export const sampleTask = {
  id: '550e8400-e29b-41d4-a716-446655440004',
  key: 'CCM-3',
  story_id: sampleStory.id,
  parent_id: null,
  issue_type: 'task',
  summary: 'Implement login API endpoint',
  description: 'Create POST /api/auth/login endpoint',
  status: 'in_progress',
  priority: 'High',
  assignee: 'bob@company.com',
  reporter: 'alice@company.com',
  labels: ['backend', 'api'],
  components: [],
  sprint_id: null,
  original_estimate: 4,
  remaining_estimate: 2,
  time_spent: 2,
  blocked_reason: null,
  due_date: '2025-01-18',
  resolved_at: null,
  metadata: {},
  created_at: '2025-01-10T00:00:00.000Z',
  updated_at: '2025-01-15T00:00:00.000Z'
};

// Sample SubTask
export const sampleSubTask = {
  id: '550e8400-e29b-41d4-a716-446655440005',
  key: 'CCM-4',
  story_id: sampleStory.id,
  parent_id: sampleTask.id,
  issue_type: 'subtask',
  summary: 'Write unit tests for login endpoint',
  description: 'Test authentication logic',
  status: 'todo',
  priority: 'Medium',
  assignee: 'bob@company.com',
  reporter: 'bob@company.com',
  labels: ['testing'],
  components: [],
  sprint_id: null,
  original_estimate: 2,
  remaining_estimate: 2,
  time_spent: 0,
  blocked_reason: null,
  due_date: '2025-01-19',
  resolved_at: null,
  metadata: {},
  created_at: '2025-01-12T00:00:00.000Z',
  updated_at: '2025-01-12T00:00:00.000Z'
};

// Sample Bug
export const sampleBug = {
  id: '550e8400-e29b-41d4-a716-446655440006',
  key: 'CCM-5',
  story_id: sampleStory.id,
  epic_id: sampleEpic.id,
  summary: 'Login button unresponsive on mobile',
  description: 'The login button does not respond to taps on iOS Safari',
  steps_to_reproduce: '1. Open site on iOS Safari\n2. Tap login button\n3. Nothing happens',
  expected_behavior: 'Login form should appear',
  actual_behavior: 'No response to tap',
  status: 'open',
  priority: 'High',
  severity: 'Major',
  resolution: null,
  environment: 'iOS 17, Safari 17.2',
  affected_versions: [],
  fix_versions: [],
  assignee: null,
  reporter: 'qa@company.com',
  labels: ['mobile', 'ios'],
  components: [],
  resolved_at: null,
  metadata: {},
  created_at: '2025-01-14T00:00:00.000Z',
  updated_at: '2025-01-14T00:00:00.000Z'
};

// Sample Sprint
export const sampleSprint = {
  id: '550e8400-e29b-41d4-a716-446655440007',
  name: 'Sprint 1',
  goal: 'Complete authentication MVP',
  status: 'active',
  start_date: '2025-01-06',
  end_date: '2025-01-17',
  velocity: null,
  metadata: {},
  created_at: '2025-01-05T00:00:00.000Z',
  updated_at: '2025-01-06T00:00:00.000Z'
};

// Sample Component
export const sampleComponent = {
  id: '550e8400-e29b-41d4-a716-446655440008',
  name: 'auth',
  description: 'Authentication and authorization module',
  lead: 'alice@company.com',
  default_assignee: 'alice@company.com',
  metadata: {},
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z'
};

// Sample Version
export const sampleVersion = {
  id: '550e8400-e29b-41d4-a716-446655440009',
  name: 'v1.0.0',
  description: 'Initial release with authentication',
  status: 'unreleased',
  start_date: '2025-01-01',
  release_date: '2025-02-01',
  metadata: {},
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z'
};

// Sample Persona
export const samplePersona = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  name: 'Power User',
  slug: 'power-user',
  description: 'Experienced user who needs advanced features',
  goals: ['Automate workflows', 'Access advanced settings', 'Integrate with other tools'],
  pain_points: ['Limited API access', 'No bulk operations', 'Manual repetitive tasks'],
  behaviors: ['Uses keyboard shortcuts', 'Prefers CLI over UI', 'Reads documentation'],
  file_id: null,
  metadata: {},
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z'
};

// Sample UX Journey
export const sampleUXJourney = {
  id: '550e8400-e29b-41d4-a716-446655440011',
  name: 'Onboarding Flow',
  slug: 'onboarding',
  description: 'First-time user experience from signup to first task completion',
  persona_ids: [samplePersona.id],
  steps: [
    { step: 1, action: 'Sign up', touchpoint: 'Landing page' },
    { step: 2, action: 'Verify email', touchpoint: 'Email' },
    { step: 3, action: 'Complete profile', touchpoint: 'Settings page' },
    { step: 4, action: 'Create first project', touchpoint: 'Dashboard' }
  ],
  touchpoints: ['Landing page', 'Email', 'Settings page', 'Dashboard'],
  file_id: null,
  metadata: {},
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z'
};

// All fixtures as a collection
export const allFixtures = {
  initiative: sampleInitiative,
  epic: sampleEpic,
  story: sampleStory,
  task: sampleTask,
  subtask: sampleSubTask,
  bug: sampleBug,
  sprint: sampleSprint,
  component: sampleComponent,
  version: sampleVersion,
  persona: samplePersona,
  uxJourney: sampleUXJourney
};
