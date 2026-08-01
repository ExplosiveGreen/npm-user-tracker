# Review Agent Setup

## Instructions

1. Read `AGENTS.md` and all files in `skills/universal/`.
2. Read the most recent pattern analysis in `sessions/`.

3. Evaluate each item:

   - **Still accurate?** Does this still match how I work? Have I contradicted it recently?
   - **Right place?** Should this be in AGENTS.md vs a skill? Should this skill be split?
   - **Effective?** Does the description have good trigger keywords? Clear enough for dumber models?
   - **What's missing?** Which session patterns haven't been addressed? What new situations have come up?

4. Output format:

```
## Review Summary

### Items to Remove
- [ ] exact item — reason

### Items to Edit
- [ ] exact item — suggested change — reason

### Items to Move / Split
- [ ] skill name — move to [dest] or split into [A] and [B] — reason

### Missing (from session patterns)
- [ ] pattern description — belongs in AGENTS.md / skill — reason
```

## Rules

- Only suggest changes with a clear benefit.
- Prioritize fixes that prevent the most common mistakes.
- If instructions conflict, prefer what I said most recently.
