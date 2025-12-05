---
metadata:
  status: PRODUCTION
  version: 1.0
  tldr: "AIGILE methodology - AI-first hybrid approach combining waterfall planning with agile execution for AI agents"
  author: Vladimir K.S.
  critical: true
---

# AIGILE Methodology

## Executive Summary

AIGILE is **NOT** traditional Agile. It's a hybrid methodology designed for AI-assisted development where:
- **AI agents** write code, not human teams
- **Sprints** are hours/minutes, not weeks
- **Full vision** is captured upfront (waterfall-style)
- **Modules** are built foundation-up, not MVP-style

---

## Classical Agile vs AIGILE

```mermaid
graph TB
    subgraph "Classical Agile"
        CA1[Minimal planning]
        CA2[2-week sprints]
        CA3[MVP each sprint]
        CA4[Human team]
        CA5[Discover requirements iteratively]
    end

    subgraph "AIGILE"
        AI1[Full vision upfront]
        AI2[Hour/minute sprints]
        AI3[Module-by-module build]
        AI4[AI agents]
        AI5[Complete specs before coding]
    end

    CA1 -.-> AI1
    CA2 -.-> AI2
    CA3 -.-> AI3
    CA4 -.-> AI4
    CA5 -.-> AI5
```

---

## Key Differences

| Aspect | Classical Agile | AIGILE |
|--------|-----------------|--------|
| **Planning** | Minimal upfront | Full vision captured |
| **Sprint Duration** | 1-2 weeks | Hours or minutes |
| **Team** | Human developers | AI agents |
| **Each Sprint** | Working MVP | Module/component |
| **Requirements** | Discovered iteratively | Spec-driven upfront |
| **Architecture** | Emergent | Designed first |
| **Testing** | Per feature | TDD from start |
| **Parallelism** | Limited by humans | AI agents in parallel |

---

## AIGILE Development Phases

### Phase 1: Vision Capture (Waterfall)

**Goal:** Complete understanding before any code

```mermaid
graph TB
    V1[User Vision] --> V2[PRD Document]
    V2 --> V3[Technical Requirements]
    V3 --> V4[Functional Requirements]
    V4 --> V5[Non-Functional Requirements]

    V5 --> V6{Vision Complete?}
    V6 -->|No| V1
    V6 -->|Yes| Architecture
```

**Artifacts:**
- Product Requirements Document (PRD)
- Technical specifications
- Quality requirements (scaling, performance)
- User personas and journeys
- BDD feature files (Gherkin)

**AIGILE Commands:**
```
aigile initiative create "Product Vision"
aigile epic create "Feature Area" -i INIT-1
aigile persona create "Target User"
aigile ux-journey create "User Flow"
```

### Phase 2: Architecture Design

**Goal:** Optimal technical foundation before coding

```mermaid
graph TB
    A1[Requirements] --> A2[System Architecture]
    A2 --> A3[Component Design]
    A3 --> A4[Tech Stack Selection]
    A4 --> A5[Module Dependencies]
    A5 --> A6[Integration Plan]

    A6 --> A7{Architecture Validated?}
    A7 -->|No| A2
    A7 -->|Yes| Sprint Planning
```

**Artifacts:**
- System architecture diagrams (C4)
- Component specifications
- API contracts
- Database schemas
- Integration points

### Phase 3: Sprint Planning (Agile Returns)

**Goal:** Plan module-by-module execution

```mermaid
graph TB
    SP1[Architecture] --> SP2[Identify Modules]
    SP2 --> SP3[Define Dependencies]
    SP3 --> SP4[Order by Foundation]
    SP4 --> SP5[Create Sprints]
    SP5 --> SP6[Assign to AI Agents]
```

**Sprint Structure:**
- Foundation modules first
- No working MVP requirement
- Parallel agent execution
- Integration sprints planned

**AIGILE Commands:**
```
aigile story create "Module: Database Schema" -e CCM-1 --points 3
aigile story create "Module: Auth Service" -e CCM-1 --points 5
aigile sprint create "Sprint 1: Foundation" --start today --end +2h
aigile sprint add-story "Sprint 1" CCM-5
```

### Phase 4: Sprint Execution

**Goal:** AI agents build modules in parallel

```mermaid
sequenceDiagram
    participant O as Orchestrator
    participant A1 as AI Agent 1
    participant A2 as AI Agent 2
    participant A3 as AI Agent 3

    Note over O,A3: Sprint 1: Foundation (1 hour)

    O->>A1: Build database schema
    O->>A2: Build config system
    O->>A3: Build logging module

    A1-->>O: Schema complete + tests
    A2-->>O: Config complete + tests
    A3-->>O: Logging complete + tests

    Note over O,A3: Sprint 2: Core Services (1 hour)

    O->>A1: Build auth service
    O->>A2: Build user service
    O->>A3: Build API gateway

    A1-->>O: Auth complete + tests
    A2-->>O: User complete + tests
    A3-->>O: Gateway complete + tests

    Note over O,A3: Sprint 3: Integration (30 min)

    O->>A1: Integrate auth + user
    O->>A2: E2E tests
```

### Phase 5: Integration & Testing

**Goal:** Combine modules into working system

```mermaid
graph TB
    I1[Modules Built] --> I2[Integration Sprint]
    I2 --> I3[E2E Tests]
    I3 --> I4[Performance Tests]
    I4 --> I5[Deployment]

    I3 -->|Failures| I6[Fix Sprint]
    I6 --> I3
```

---

## Sprint Types in AIGILE

| Sprint Type | Duration | Purpose |
|-------------|----------|---------|
| Foundation | 1-2 hours | Core infrastructure |
| Module | 30min-1hr | Individual components |
| Integration | 30min-1hr | Combine modules |
| Testing | 30min | E2E validation |
| Fix | 15-30min | Address issues |

---

## Development Principles

### Specification-Driven Development (SDD)

**Never code without approved specifications.**

```mermaid
graph LR
    R[Requirements] --> S[Specification]
    S --> V{Approved?}
    V -->|No| R
    V -->|Yes| C[Code]
```

### Behavior-Driven Development (BDD)

**Define behavior before implementation.**

```gherkin
Feature: User Authentication
  Scenario: Successful login
    Given a registered user exists
    When they submit valid credentials
    Then they receive an auth token
    And are redirected to dashboard
```

### Test-Driven Development (TDD)

**Tests first, then implementation.**

```mermaid
graph LR
    T[Write Test] --> F[Test Fails]
    F --> C[Write Code]
    C --> P[Test Passes]
    P --> R[Refactor]
    R --> T
```

---

## Module-First Architecture

### Build Order

```mermaid
graph TB
    subgraph "Sprint 1: Foundation"
        F1[Database]
        F2[Config]
        F3[Logging]
    end

    subgraph "Sprint 2: Core"
        C1[Auth]
        C2[Users]
        C3[API]
    end

    subgraph "Sprint 3: Features"
        FF1[Feature A]
        FF2[Feature B]
    end

    subgraph "Sprint 4: Integration"
        I1[E2E Tests]
        I2[Deployment]
    end

    F1 --> C1
    F2 --> C1
    F3 --> C1
    F1 --> C2
    C1 --> FF1
    C2 --> FF1
    C3 --> FF2
    FF1 --> I1
    FF2 --> I1
    I1 --> I2
```

### Not MVP Per Sprint

Classical Agile delivers working software each sprint. AIGILE delivers:

| Sprint | Deliverable |
|--------|-------------|
| 1 | Database schema + migrations + tests |
| 2 | Auth service + tests (no UI) |
| 3 | API endpoints + tests (no frontend) |
| 4 | Frontend components + tests |
| 5 | Integration + E2E tests |
| 6 | **First working system** |

---

## AI Agent Parallelism

### Parallel Execution

```mermaid
gantt
    title Sprint Execution (Parallel AI Agents)
    dateFormat HH:mm
    section Agent 1
    Database Module     :a1, 00:00, 30m
    Auth Integration    :a2, after a1, 20m
    section Agent 2
    Config Module       :b1, 00:00, 20m
    User Service        :b2, after b1, 30m
    section Agent 3
    Logging Module      :c1, 00:00, 15m
    API Gateway         :c2, after c1, 35m
```

### Agent Independence

Each AI agent works independently on:
- Separate modules
- No shared state during sprint
- Own test suite
- Integration at sprint end

---

## AIGILE CLI Workflow

### Phase 1: Vision Capture

```
aigile init
aigile initiative create "Product: My App"
aigile epic create "User Management" -i INIT-1
aigile epic create "Data Processing" -i INIT-1
aigile epic create "Reporting" -i INIT-1
aigile persona create "End User"
aigile ux-journey create "Onboarding"
```

### Phase 2: Story Definition

```
aigile story create "Database schema design" -e CCM-1 --points 3
aigile story create "Auth service implementation" -e CCM-1 --points 5
aigile story create "User service implementation" -e CCM-1 --points 5
aigile story create "API gateway setup" -e CCM-1 --points 3
```

### Phase 3: Sprint Planning

```
aigile sprint create "Sprint 1: Foundation" --start now --end +2h -g "Core infrastructure"
aigile sprint add-story "Sprint 1" CCM-5
aigile sprint add-story "Sprint 1" CCM-6

aigile sprint create "Sprint 2: Services" --start +2h --end +4h -g "Core services"
aigile sprint add-story "Sprint 2" CCM-7
aigile sprint add-story "Sprint 2" CCM-8
```

### Phase 4: Execution

```
aigile sprint start "Sprint 1"
aigile ai begin
aigile task transition CCM-10 in_progress
# ... AI agent implements ...
aigile task transition CCM-10 done
aigile ai end -s "Database module complete with tests"
```

---

## Success Criteria

### Vision Phase
- [ ] Complete PRD document
- [ ] All epics defined
- [ ] Personas created
- [ ] UX journeys mapped
- [ ] BDD features written

### Architecture Phase
- [ ] System architecture documented
- [ ] Tech stack selected
- [ ] Module dependencies mapped
- [ ] API contracts defined
- [ ] Database schema designed

### Execution Phase
- [ ] Modules built with tests
- [ ] All tests passing
- [ ] Integration complete
- [ ] E2E tests passing
- [ ] System deployed

---

## Cross-References

- [AI Agent Guide](./AI-AGENT-GUIDE.md) - Agent workflow
- [Sprint Planning Journey](./04_ux-journeys/journey-03-sprint-planning.md) - Sprint workflow
- [Entity Hierarchy](./05_architecture/entity-hierarchy.md) - Work item structure
