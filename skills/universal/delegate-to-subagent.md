---
description: "Use when a task touches 3+ files across directories with a narrow focus. Use when delegating implementation of a module from a spec. Trigger: delegate, sub-agent, subagent, orchestrator phase, hand off to, let X handle, spawn agent for"
---

## When to Use This Skill

Run the decision checklist from AGENTS.md first. Only use this if ALL conditions are met:
- 3+ files across directories
- Requires deep focus on one problem
- Can be independently verified
- Would take 15+ steps

## Template

When you delegate, structure the instructions like this:

```markdown
You are [role]. Your job is [one specific deliverable].

## What to build
- [file 1]: [what goes in it]
- [file 2]: [what goes in it]
- Follow [spec section] in PLAN.md

## Rules
- [do X]
- [don't do Y]

## Done when
- [concrete completion criteria 1]
- [concrete completion criteria 2]
- Commit with message: "feat: [description]"
```

## Do's and Don'ts

- DO give the sub-agent the exact spec section to follow
- DO include completion criteria so it knows when to stop
- DO commit after each sub-agent finishes
- DO use a reviewer sub-agent after implementation to check correctness

- DON'T delegate without telling it exactly what files to create/modify
- DON'T delegate vague tasks like "improve the code"
- DON'T spawn sub-agents for questions, reading files, or single-file edits
- DON'T let sub-agents access network, deploy, or run dev servers
