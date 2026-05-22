# Content → Project Compiler

## Hackathon Project Write-Up

Built for the [daily.dev Hackathon](https://app.daily.dev/posts/daily-dev-hackathon-6kjkeorcd?utm_source=chatgpt.com) and developer activity data.

---

# 1. Project Overview

Content → Project Compiler transforms passive developer content consumption into actionable software projects.

The application analyzes a developer’s activity and interests from daily.dev, including:

* bookmarks,
* reading history,
* followed tags,
* stack preferences,
* engagement patterns,
* discussions,
* trending technologies,

and generates:

* personalized project ideas,
* implementation plans,
* architecture recommendations,
* learning roadmaps,
* starter repository structures.

The platform acts as an “idea compiler” for developers.

Instead of endlessly consuming articles, developers receive practical projects tailored to their actual interests and growth trajectory.

---

# 2. Problem Statement

Developers consume enormous amounts of technical information daily:

* tutorials,
* blog posts,
* benchmarks,
* architecture discussions,
* framework comparisons,
* ecosystem news.

However, most developers struggle with:

* converting knowledge into experience,
* finding meaningful project ideas,
* avoiding tutorial hell,
* building portfolio-quality work,
* understanding what to build next.

Current platforms optimize for:

* engagement,
* scrolling,
* discovery,
* retention.

Very few optimize for:

* execution,
* synthesis,
* deliberate practice,
* project generation.

This project addresses that gap.

---

# 3. Core Concept

The system converts developer content consumption into project specifications.

## Example

### User Activity

Saved Content:

* Rust async programming article
* CQRS discussion
* Event sourcing tutorial
* Kafka benchmark article

### Generated Project

## “Distributed Event Journal”

### Recommended Stack

* TypeScript
* Node.js
* PostgreSQL
* Kafka
* Next.js dashboard

### Features

* append-only event log
* replay engine
* snapshotting
* async worker pipeline
* metrics dashboard

### Learning Goals

* event-driven systems
* distributed architecture
* async workflows
* streaming concepts

### Milestones

1. Build local event store
2. Add replay functionality
3. Implement worker queue
4. Add distributed synchronization
5. Create observability dashboard

---

# 4. Why This Is Interesting

The project combines:

* recommendation systems,
* semantic clustering,
* developer identity,
* AI-assisted planning,
* personalized learning,
* workflow tooling.

It is not “another AI summary app”.

Instead, it creates a bridge between:

```text
content consumption
        ↓
interest extraction
        ↓
topic clustering
        ↓
project synthesis
        ↓
real-world implementation
```

---

# 5. Hackathon Track Alignment

## Content → Action

Transforms passive content into actionable software projects.

## Developer Identity

Uses developer interests and reading behavior to infer meaningful project directions.

## Content Intelligence

Extracts semantic patterns from consumed technical content.

---

# 6. MVP Scope

The hackathon MVP should focus on a strong end-to-end experience.

## Required Features

### Authentication

* Login with daily.dev account/API token

### Activity Import

* Fetch:

  * bookmarks,
  * reading history,
  * followed tags,
  * developer stack

### Interest Extraction

* Cluster topics:

  * backend,
  * systems,
  * AI,
  * cloud,
  * frontend,
  * DevOps,
  * distributed systems,
  * etc.

### Project Generation

Generate:

* project title,
* description,
* recommended stack,
* milestone roadmap,
* architecture overview,
* learning goals.

### Visual UI

Display:

* topic clusters,
* generated projects,
* roadmap timeline,
* stack visualization.

---

# 7. Future Extensions

## Repository Bootstrap

Generate:

* folder structure,
* package setup,
* Docker config,
* CI templates,
* starter code.

## OSS Matching

Recommend:

* GitHub issues,
* open-source projects,
* contribution opportunities.

## Skill Evolution

Track:

* learning progression,
* specialization drift,
* emerging interests.

## Career Mode

Suggest:

* portfolio projects,
* resume-aligned builds,
* interview-strengthening implementations.

---

# 8. Recommended Technical Stack

Hackathon priority:

* iteration speed,
* deployment simplicity,
* demo quality.

TypeScript fullstack is the correct tradeoff for the MVP.

---

# 9. Technical Architecture

## Frontend

* Next.js 15
* React
* TailwindCSS
* shadcn/ui

## Backend

* Next.js server actions / API routes
* TypeScript

## Database

* PostgreSQL or SQLite
* Prisma or Drizzle ORM

## AI Layer

* embeddings
* structured prompts
* semantic clustering
* project synthesis pipeline

## Visualization

* D3.js
* Cytoscape.js
* Recharts

## API Integration

* GraphQL client
* daily.dev API ingestion

daily.dev exposes GraphQL-based infrastructure and developer activity systems suitable for feed and personalization tooling. ([GitHub][1])

---

# 10. Suggested Application Flow

```text
daily.dev account
        ↓
fetch activity
        ↓
extract topics
        ↓
cluster interests
        ↓
generate project concepts
        ↓
build roadmap
        ↓
display actionable projects
```

---

# 11. UI Concept

## Main Dashboard

### Left Panel

Developer interest graph:

* Rust
* AI
* distributed systems
* databases
* DevOps
* frontend
* etc.

### Center

Generated project cards.

### Right Panel

Roadmap view:

* milestones,
* learning objectives,
* architecture guidance.

---

# 12. Example Generated Projects

## Systems Programming User

### “High-Performance Log Aggregator”

* Rust-inspired architecture concepts
* async pipelines
* observability
* streaming

## AI-Focused User

### “Semantic Research Assistant”

* vector search
* embeddings
* retrieval systems
* local inference

## Frontend User

### “Collaborative Component Playground”

* realtime sync
* CRDTs
* design systems
* multiplayer editing

---

# 13. Suggested Prompt Strategy

Avoid:

* vague AI generation,
* generic “build a todo app” outputs.

Prefer:

* structured generation,
* constrained formats,
* architecture-aware synthesis.

Example generation sections:

* project idea,
* target difficulty,
* estimated completion time,
* architecture style,
* learning outcomes,
* optional advanced extensions.

---

# 14. Demo Strategy

The demo should emphasize:

## Before

Developer doomscrolling content endlessly.

## After

The system generating:

* meaningful projects,
* implementation plans,
* technical direction,
* actionable next steps.

The strongest moment in the demo:

> “You already consumed the knowledge.
>
> Here is what you should build next.”

---

# 15. Suggested Folder Structure

```text
/apps
  /web

/packages
  /ai
  /core
  /dailydev
  /project-generator
  /ui

/prisma

/public
```

---

# 16. Suggested Development Plan

* setup app
* daily.dev integration
* import bookmarks/activity
* basic UI

* topic extraction
* embeddings
* project generation
* roadmap generation

* polish UI
* visualizations
* improve prompts
* deploy
* demo preparation

---

# 17. Vision

Developers should not leave technical content thinking:

> “Interesting… but what should I actually build?”

Content → Project Compiler answers that automatically.

[1]: https://github.com/dailydotdev/daily-api?utm_source=chatgpt.com "dailydotdev/daily-api"
