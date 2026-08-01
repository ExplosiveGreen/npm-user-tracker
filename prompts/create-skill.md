# Create a Skill

Use this when I ask you to create a skill for a repeated workflow.

## Format

Create `skills/universal/[name].md`:

```markdown
---
description: "Use when [trigger conditions]. Trigger: [keyword1, keyword2, keyword3]"
requires: "[optional prerequisites]"
---

## Context
Why this skill exists and what problem it solves.

## Steps
1. First step
2. Second step
...

## Examples
Good output: [example]
Bad output: [example to avoid]

## Rules
- Do [this]
- Don't [that]
```

## Design Rules

- Description must be trigger-oriented, not action-oriented.
  - GOOD: "Use when user asks to file, open, or create a PR"
  - BAD: "This skill files a pull request with proper formatting"
- One intent per skill. If it does two things, split it.
- Keep it minimal. Just enough context to execute.
- For weaker models: include explicit do/don't lists, shorter sentences.
- If it needs specific tools or config, put in `requires`.
