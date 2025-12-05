/**
 * Template Packs Service
 *
 * Manages template packs for different init profiles.
 * Templates are data-driven, not hardcoded in logic.
 *
 * @author Vladimir K.S.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

export type InitProfile = 'full-repo' | 'subrepo' | 'module';

export type DbMode = 'local' | 'shared';

/**
 * Template file definition
 */
export interface TemplateFile {
  path: string;
  content: string;
}

/**
 * Config.yaml structure for AIGILE
 */
export interface AigileConfig {
  db: {
    mode: DbMode;
    path: string;
  };
  profile: InitProfile;
  repo_root: string;
  parent_repo_root?: string;
  module?: {
    name: string;
    kind: string;
    path: string;
  };
}

/**
 * Standard frontmatter template for documents
 */
function createFrontmatter(title: string, tldr: string, modules: string[] = []): string {
  return `---
metadata:
  status: TEMPLATE
  version: "1.0"
  tldr: "${tldr}"
  title: "${title}"
  modules: [${modules.map(m => `"${m}"`).join(', ')}]
  authors: []
  dependencies: []
---

`;
}

/**
 * Get template files for full-repo profile
 */
export function getFullRepoTemplates(): TemplateFile[] {
  return [
    // 00_DOCS hierarchy
    {
      path: '00_DOCS/00_vision/01_mission-vision.md',
      content: createFrontmatter(
        'Mission & Vision',
        'Define company mission, vision, values, and elevator pitch',
        ['vision']
      ) + `# Mission & Vision

## Mission Statement
<!-- Why does this company/product exist? -->

## Vision Statement
<!-- What future are we creating? -->

## Core Values
<!-- What principles guide our decisions? -->

## Elevator Pitch
<!-- One sentence: What do we do? -->
`
    },
    {
      path: '00_DOCS/01_strategy/01_strategic-analysis.md',
      content: createFrontmatter(
        'Strategic Analysis',
        'SWOT analysis and strategic pillars',
        ['strategy']
      ) + `# Strategic Analysis

## SWOT Analysis

### Strengths
-

### Weaknesses
-

### Opportunities
-

### Threats
-

## Strategic Pillars
<!-- Key focus areas for the next 1-3 years -->

`
    },
    {
      path: '00_DOCS/02_target-audience/01_personas.md',
      content: createFrontmatter(
        'User Personas',
        'Define ideal customer profile and user personas',
        ['personas', 'ux']
      ) + `# User Personas

## Ideal Customer Profile (ICP)
<!-- Who is our primary customer? -->

## Primary Personas

### Persona 1: [Name]
- **Role:**
- **Goals:**
- **Frustrations:**
- **Key Tasks:**

`
    },
    {
      path: '00_DOCS/03_finance-legal/01_model.md',
      content: createFrontmatter(
        'Business Model',
        'Revenue model and financial overview',
        ['finance']
      ) + `# Business Model

## Revenue Model
<!-- How do we make money? -->

## Pricing Strategy
<!-- How do we price our offerings? -->

## Key Metrics
<!-- What metrics matter most? -->

`
    },
    {
      path: '00_DOCS/04_raw-inputs/README.md',
      content: createFrontmatter(
        'Raw Inputs',
        'Repository for raw user feedback, interviews, and research data',
        ['research']
      ) + `# Raw Inputs

This directory contains raw, unprocessed input from users, stakeholders, and research.

## Contents
- User interviews
- Survey responses
- Support tickets
- Feature requests
- Competitive intelligence

`
    },
    {
      path: '00_DOCS/05_research/README.md',
      content: createFrontmatter(
        'Research',
        'Market research and analysis documents',
        ['research']
      ) + `# Research

This directory contains research and analysis documents.

## Contents
- Market analysis
- User research
- Technical research
- Competitive analysis

`
    },
    {
      path: '00_DOCS/06_product-specs/01_prd.md',
      content: createFrontmatter(
        'Product Requirements Document',
        'Main PRD template for product features',
        ['product', 'specs']
      ) + `# Product Requirements Document (PRD)

## Overview
<!-- Brief description of the product/feature -->

## Problem Statement
<!-- What problem are we solving? -->

## Goals & Success Metrics
<!-- How will we measure success? -->

## User Stories
<!-- Link to user stories -->

## Requirements
### Functional Requirements
-

### Non-Functional Requirements
-

## Out of Scope
-

`
    },
    {
      path: '00_DOCS/06_product-specs/epics/README.md',
      content: createFrontmatter(
        'Epics Directory',
        'Contains epic-level product specifications',
        ['product', 'epics']
      ) + `# Epics

This directory contains epic-level specifications.

`
    },
    {
      path: '00_DOCS/06_product-specs/stories/README.md',
      content: createFrontmatter(
        'User Stories Directory',
        'Contains user story specifications',
        ['product', 'stories']
      ) + `# User Stories

This directory contains user story specifications.

`
    },
    {
      path: '00_DOCS/07_ux-design/00_README.md',
      content: createFrontmatter(
        'UX Design',
        'UX design documentation and journey maps',
        ['ux']
      ) + `# UX Design

## Contents
- User journeys
- Wireframes
- Design system references
- Interaction patterns

`
    },
    {
      path: '00_DOCS/07_ux-design/journeys/README.md',
      content: createFrontmatter(
        'User Journeys',
        'User journey maps and flow documentation',
        ['ux', 'journeys']
      ) + `# User Journeys

This directory contains user journey maps.

`
    },
    {
      path: '00_DOCS/08_go-to-market/01_launch-plan.md',
      content: createFrontmatter(
        'Launch Plan',
        'Go-to-market strategy and launch checklist',
        ['gtm']
      ) + `# Launch Plan

## Launch Goals
-

## Target Audience
-

## Channels
-

## Timeline
-

## Checklist
- [ ] Marketing materials ready
- [ ] Documentation complete
- [ ] Support trained
- [ ] Analytics configured

`
    },
    {
      path: '00_DOCS/11_people-ops/ai-agents/README.md',
      content: createFrontmatter(
        'AI Agents',
        'AI agent configurations and prompts',
        ['ai', 'agents']
      ) + `# AI Agents

This directory contains AI agent configurations and prompts.

`
    },
    {
      path: '00_DOCS/11_people-ops/sops/README.md',
      content: createFrontmatter(
        'Standard Operating Procedures',
        'Team SOPs and process documentation',
        ['sops']
      ) + `# Standard Operating Procedures

This directory contains team SOPs and process documentation.

`
    },
    {
      path: '00_DOCS/12_customer-success/installation.md',
      content: createFrontmatter(
        'Installation Guide',
        'Installation and setup instructions',
        ['docs', 'installation']
      ) + `# Installation Guide

## Prerequisites
-

## Installation Steps
1.
2.
3.

## Verification
-

`
    },
    {
      path: '00_DOCS/12_customer-success/quick-start.md',
      content: createFrontmatter(
        'Quick Start Guide',
        'Getting started guide for new users',
        ['docs', 'quickstart']
      ) + `# Quick Start Guide

## Overview
<!-- Brief intro -->

## Step 1: Setup
<!-- First step -->

## Step 2: First Action
<!-- Second step -->

## Next Steps
<!-- What to do next -->

`
    },
    {
      path: '00_DOCS/12_customer-success/troubleshooting.md',
      content: createFrontmatter(
        'Troubleshooting Guide',
        'Common issues and solutions',
        ['docs', 'troubleshooting']
      ) + `# Troubleshooting

## Common Issues

### Issue: [Description]
**Symptoms:**
**Solution:**

`
    },
    {
      path: '00_DOCS/99_archive/00_README.md',
      content: createFrontmatter(
        'Archive',
        'Archived documents no longer in active use',
        ['archive']
      ) + `# Archive

This directory contains archived documents that are no longer in active use but are kept for reference.

`
    },

    // 01_SPECS hierarchy
    {
      path: '01_SPECS/00_adr/README.md',
      content: createFrontmatter(
        'Architecture Decision Records',
        'ADRs documenting key technical decisions',
        ['specs', 'adr']
      ) + `# Architecture Decision Records (ADRs)

This directory contains ADRs for documenting key technical decisions.

## Template
Use the template in \`template.md\` for new ADRs.

`
    },
    {
      path: '01_SPECS/01_domain-models/README.md',
      content: createFrontmatter(
        'Domain Models',
        'Domain model specifications',
        ['specs', 'domain']
      ) + `# Domain Models

This directory contains domain model specifications.

`
    },
    {
      path: '01_SPECS/02_api-contracts/README.md',
      content: createFrontmatter(
        'API Contracts',
        'API specifications and contracts',
        ['specs', 'api']
      ) + `# API Contracts

This directory contains API specifications and contracts.

`
    },
    {
      path: '01_SPECS/03_c4-components/README.md',
      content: createFrontmatter(
        'C4 Architecture',
        'C4 model component diagrams',
        ['specs', 'architecture']
      ) + `# C4 Architecture Components

This directory contains C4 model architecture diagrams.

`
    },
    {
      path: '01_SPECS/04_ui-ux-specs/README.md',
      content: createFrontmatter(
        'UI/UX Specifications',
        'UI/UX technical specifications',
        ['specs', 'ux']
      ) + `# UI/UX Specifications

This directory contains UI/UX technical specifications.

`
    },
    {
      path: '01_SPECS/05_infrastructure/README.md',
      content: createFrontmatter(
        'Infrastructure',
        'Infrastructure and deployment specifications',
        ['specs', 'infra']
      ) + `# Infrastructure

This directory contains infrastructure and deployment specifications.

`
    },

    // 02_FEATURES hierarchy
    {
      path: '02_FEATURES/00_smoke-tests/README.md',
      content: createFrontmatter(
        'Smoke Tests',
        'Critical path smoke test scenarios',
        ['features', 'tests']
      ) + `# Smoke Tests

This directory contains smoke test feature files for critical paths.

`
    },
    {
      path: '02_FEATURES/01_epics/README.md',
      content: createFrontmatter(
        'Epic Features',
        'BDD feature files organized by epic',
        ['features', 'epics']
      ) + `# Epic Features

This directory contains BDD feature files organized by epic.

`
    },
    {
      path: '02_FEATURES/02_end-to-end/README.md',
      content: createFrontmatter(
        'End-to-End Features',
        'End-to-end scenario feature files',
        ['features', 'e2e']
      ) + `# End-to-End Features

This directory contains end-to-end scenario feature files.

`
    },
    {
      path: '02_FEATURES/03_nfr/README.md',
      content: createFrontmatter(
        'Non-Functional Requirements',
        'NFR feature files (performance, security, etc.)',
        ['features', 'nfr']
      ) + `# Non-Functional Requirements

This directory contains NFR feature files:
- Performance
- Security
- Scalability
- Accessibility

`
    },

    // 03_TESTING_INFRA hierarchy
    {
      path: '03_TESTING_INFRA/00_governance/README.md',
      content: createFrontmatter(
        'Test Governance',
        'Testing standards and policies',
        ['testing', 'governance']
      ) + `# Test Governance

This directory contains testing standards and policies.

`
    },
    {
      path: '03_TESTING_INFRA/01_unit-layer/README.md',
      content: createFrontmatter(
        'Unit Testing Layer',
        'Unit test infrastructure and guides',
        ['testing', 'unit']
      ) + `# Unit Testing Layer

This directory contains unit test infrastructure.

`
    },
    {
      path: '03_TESTING_INFRA/02_integration-layer/README.md',
      content: createFrontmatter(
        'Integration Testing Layer',
        'Integration test infrastructure and guides',
        ['testing', 'integration']
      ) + `# Integration Testing Layer

This directory contains integration test infrastructure.

`
    },
    {
      path: '03_TESTING_INFRA/03_e2e-layer/README.md',
      content: createFrontmatter(
        'E2E Testing Layer',
        'End-to-end test infrastructure and guides',
        ['testing', 'e2e']
      ) + `# E2E Testing Layer

This directory contains E2E test infrastructure.

`
    },
    {
      path: '03_TESTING_INFRA/04_manual-qa-layer/README.md',
      content: createFrontmatter(
        'Manual QA Layer',
        'Manual QA procedures and checklists',
        ['testing', 'qa']
      ) + `# Manual QA Layer

This directory contains manual QA procedures and checklists.

`
    },
    {
      path: '03_TESTING_INFRA/qa/README.md',
      content: createFrontmatter(
        'QA Documentation',
        'QA procedures and documentation',
        ['testing', 'qa']
      ) + `# QA Documentation

This directory contains QA procedures and documentation.

`
    },
    {
      path: '03_TESTING_INFRA/reports/README.md',
      content: createFrontmatter(
        'Test Reports',
        'Test execution reports',
        ['testing', 'reports']
      ) + `# Test Reports

This directory contains test execution reports.

`
    }
  ];
}

/**
 * Get template files for subrepo profile (same as full-repo)
 */
export function getSubrepoTemplates(): TemplateFile[] {
  return getFullRepoTemplates();
}

/**
 * Get template files for module profile (minimal structure)
 */
export function getModuleTemplates(moduleName: string): TemplateFile[] {
  return [
    {
      path: 'docs/01_module-overview.md',
      content: createFrontmatter(
        `${moduleName} Overview`,
        `Overview documentation for ${moduleName} module`,
        [moduleName]
      ) + `# ${moduleName} Module Overview

## Purpose
<!-- What does this module do? -->

## Key Concepts
<!-- Core concepts and terminology -->

## Dependencies
<!-- What does this module depend on? -->

## API
<!-- Public API surface -->

`
    },
    {
      path: 'docs/02_mini-prd.md',
      content: createFrontmatter(
        `${moduleName} Requirements`,
        `Module-level requirements for ${moduleName}`,
        [moduleName, 'specs']
      ) + `# ${moduleName} Module Requirements

## Goals
<!-- What should this module achieve? -->

## Requirements
### Functional
-

### Non-Functional
-

## Out of Scope
-

`
    },
    {
      path: 'specs/01_spec-template.md',
      content: createFrontmatter(
        `${moduleName} Spec Template`,
        `Specification template for ${moduleName}`,
        [moduleName, 'specs']
      ) + `# ${moduleName} Specification

## Overview
<!-- Brief description -->

## Design
<!-- Technical design -->

## Implementation Notes
<!-- Key implementation details -->

`
    },
    {
      path: 'features/01_happy-path.feature',
      content: `Feature: ${moduleName} Happy Path
  As a user
  I want to use ${moduleName}
  So that I can achieve my goals

  Scenario: Basic usage
    Given I have configured ${moduleName}
    When I perform the main action
    Then I should see the expected result
`
    },
    {
      path: 'features/02_edge-cases.feature',
      content: `Feature: ${moduleName} Edge Cases
  As a user
  I want ${moduleName} to handle edge cases gracefully
  So that I don't encounter errors

  Scenario: Empty input
    Given I have configured ${moduleName}
    When I provide empty input
    Then I should see a helpful error message
`
    }
  ];
}

/**
 * Get templates for a given profile
 */
export function getTemplatesForProfile(profile: InitProfile, moduleName?: string): TemplateFile[] {
  switch (profile) {
    case 'full-repo':
      return getFullRepoTemplates();
    case 'subrepo':
      return getSubrepoTemplates();
    case 'module':
      return getModuleTemplates(moduleName ?? 'module');
    default:
      return [];
  }
}

/**
 * Write templates to a target directory
 * Only writes files that don't already exist (non-destructive)
 */
export function writeTemplates(
  targetDir: string,
  templates: TemplateFile[]
): { written: number; skipped: number } {
  let written = 0;
  let skipped = 0;

  for (const template of templates) {
    const fullPath = join(targetDir, template.path);
    const dir = dirname(fullPath);

    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Only write if file doesn't exist
    if (!existsSync(fullPath)) {
      writeFileSync(fullPath, template.content, 'utf-8');
      written++;
    } else {
      skipped++;
    }
  }

  return { written, skipped };
}

/**
 * Generate config.yaml content
 */
export function generateConfigYaml(config: AigileConfig, projectKey: string, projectName: string): string {
  let yaml = `# AIGILE Project Configuration
# Auto-generated by aigile init

db:
  mode: ${config.db.mode}
  path: ${config.db.path}

profile: ${config.profile}
repo_root: ${config.repo_root}
`;

  if (config.parent_repo_root) {
    yaml += `parent_repo_root: ${config.parent_repo_root}\n`;
  }

  if (config.module) {
    yaml += `
module:
  name: ${config.module.name}
  kind: ${config.module.kind}
  path: ${config.module.path}
`;
  }

  yaml += `
project:
  key: ${projectKey}
  name: ${projectName}

sync:
  enabled: true
  patterns:
    - "**/*.md"
    - "**/*.feature"
    - "**/*.yaml"
    - "**/*.yml"
  ignore:
    - node_modules
    - dist
    - .git
    - coverage
`;

  return yaml;
}
