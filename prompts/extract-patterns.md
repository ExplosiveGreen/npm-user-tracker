# Extract Patterns from Agent History

## Instructions

1. Review our recent conversation history (last 5-20 sessions).
2. For each session, identify:
   - Did you have to correct me or did I correct you? What was the correction?
   - Did you do something I didn't like? What?
   - Did you repeat an instruction you've given me before?
   - Did a task take longer than I expected? Why?
3. Categorize each finding:

   - **MISSING_INSTRUCTION**: Something I told you that isn't in AGENTS.md
   - **REPEATED_PATTERN**: Something we've gone over 3+ times
   - **WRONG_BEHAVIOR**: You did something actively harmful or wrong
   - **INEFFICIENCY**: You used too many steps, sub-agents, or resources
   - **MISCOMMUNICATION**: You misunderstood what I wanted

4. Output format:

```
## Session Patterns (DATE)

### MISSING_INSTRUCTION
- "prefer pnpm over npm for this project"
- "always run type check before committing"

### REPEATED_PATTERN
- "don't modify tests unless the behavior changes"

### WRONG_BEHAVIOR
- "started a dev server when I only asked for a code review"

### INEFFICIENCY
- "spawned 3 sub-agents to add one import statement"

### MISCOMMUNICATION
- "thought 'clean up' meant delete files instead of refactor"
```

5. Save to `sessions/patterns-YYYY-MM-DD.md`.

## Rules

- Be specific. Include exact wording.
- Group similar patterns. Focus on repeats, not one-offs.
- If unsure, include it anyway — false positives are better than misses.
