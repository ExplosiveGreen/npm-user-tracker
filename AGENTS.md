# AGENTS.md — Letter to My Agent Coworker

## Who I Am

I'm a developer who builds TypeScript libraries and React Native apps. I focus on making complex things simple. I value correctness and clean APIs over clever tricks.

## How I Work

- Be concise. Don't ask yes/no questions — just do the thing. If you need input, make a recommendation.
- Questions are read-only. When I ask about something, do not make changes. Just answer.
- If I ask why something took longer than expected, analyze and categorize your tool calls to show what was and wasn't helpful.

## What I Value

- **Type safety**. If TypeScript code looks like a Python dev wrote it, it's bad TypeScript. Avoid `any` unless there is no typed alternative or I explicitly ask for it.
- **Keep things simple**. Prefer boring, explicit code. Oneliners that are just casting wrappers are not clever.
- **Tests should be focused, not slop**. Endless smoke tests and regression tests for everything are worse than nothing. Test specific behavior.
- **Comments clarify why, not what**. Don't comment every line. Describe concisely how functions are used above their definition. Keep comments in sync with code.
- **Don't be scared to propose bold ideas** that can meaningfully benefit the work.
- **Be careful with destructive actions** not explicitly requested.
- **Blast radius**. Don't destroy production environments, kill running dev servers, or access remote data without care.

## Coding Preferences

- **TypeScript** for anything non-trivial. Write TypeScript that actual TypeScript experts would be proud of.
- **Package manager**: prefer `bun`, then `pnpm`.
- **Prefer targeted verification first**: type check and lint before full builds. Don't spin up dev servers unless I ask.
- **Tech stack** (when no existing tech in repo): TypeScript, React, React Native, Expo, NativeWind/Tailwind, Node.js.
- **Tests**: use the existing test framework in the project. Don't add a new one.

## Sub-Agent Usage Policy

I use opencode through T3 Chat. Sub-agents are available but must only be used for big tasks.

### How Sub-Agents Work in opencode

Sub-agents are configured as `.md` files in `.opencode/agents/` with `mode: subagent` in frontmatter. To delegate, use `@agent-name` syntax:
```
@runtime-dev Implement the __step function described in PLAN.md section 1.2
```
The primary agent must have `task` permissions in its frontmatter listing which sub-agents it can spawn.

### When to Use Sub-Agents (BIG tasks only)

Spawning a sub-agent costs time and context. Only delegate if ALL of these are true:

1. **Multiple files to create/modify** (3+ files across different directories)
2. **Requires deep focus** on a narrow problem (e.g., implementing one module from a spec)
3. **Can be independently verified** without cross-referencing other ongoing work
4. **Would take 15+ steps** if done directly

### When NOT to Use Sub-Agents

Do NOT spawn a sub-agent for:

- Adding a single import or fixing one type error
- Renaming a variable or function
- Editing one file
- Running tests or linting
- Reading a file and reporting its contents
- Anything the primary agent can do in 3-5 tool calls
- Exploratory questions like "what does this function do?"

### Decision Checklist

Before spawning a sub-agent, ask yourself:
- [ ] Does this touch 3+ files? If no → do it yourself
- [ ] Does this need specialized knowledge I don't have? If no → do it yourself
- [ ] Would it take <15 steps? If yes → do it yourself
- [ ] Can I describe the task in 2-3 sentences? If no → it's probably too vague, refine first

### Sub-Agent Template

When you do delegate, create clear instructions:

```markdown
You are [role]. Your job is [one specific thing].

What to build:
- [exact files to create/modify, exact spec to follow]

Rules:
- [guardrails specific to this task]

Done when:
- [concrete completion criteria]

Stop conditions:
- [what should NOT be done]
- Commit and report when done
```

## Guardrails

- Never push directly to `main`. Always use a feature branch → push → PR → wait for review.
- Do not spin up dev servers unless explicitly requested — they break my running environment.
- When multiple sub-agents work in parallel, declare file ownership up front so they don't collide.
- Follow the Sub-Agent Usage Policy strictly. When in doubt, do NOT spawn a sub-agent — do the work yourself.
- Instructions here are good defaults, not hard rules. If I tell you something different in the prompt, my prompt overrides.

---

## Post-Task Audit (Automatic)

After finishing a big task, automatically run an audit. Do NOT wait for me to ask.

### What Counts as a "Big Task"

Any of these triggers means run an audit:
- Modified 5+ files
- Spawned sub-agents
- Session took 30+ tool calls
- Task involved 3+ git commits
- You created a new module, API endpoint, or feature from scratch
- You're about to say "done" after a complex change

### What the Audit Should Cover

After the task is complete and before reporting "done":

1. **Look at what went wrong during the task**
   - Did I correct you at any point? What did I say?
   - Did anything take longer than expected? Why?
   - Did you make any mistakes you had to undo?
   - Did you do anything I didn't explicitly ask for?

2. **Record findings in** `sessions/patterns-YYYY-MM-DD.md` using the format from the extract-patterns prompt.

3. **If any pattern repeats from previous sessions**, suggest an update to AGENTS.md or a new skill. Say: "I noticed [pattern] happened again. Should I add this to AGENTS.md or create a skill for it?"

4. **Report summary** at the end: "Post-task audit complete. Found [N] issues, [M] new patterns, [P] repeats from previous sessions."

### Don't Over-Audit

- Small tasks (one file edit, type fix, renaming): skip the audit
- If nothing went wrong: just say "Audit found no issues" and move on
- The audit should take <30 seconds of思考, not derail the flow

## Self-Management: How to Maintain This System

This file and the skills in `skills/` are designed to be self-managing. Follow these instructions when I ask you to update the system.

### Extracting Patterns

When I say "extract patterns" or "analyze my history":

1. Review our recent conversation history (last 5-20 sessions).
2. For each session, identify:
   - Did you have to correct me or did I correct you? What was the correction?
   - Did you do something I didn't like? What?
   - Did you repeat an instruction you've given me before?
   - Did a task take longer than I expected? Why?
3. Categorize each finding: MISSING_INSTRUCTION, REPEATED_PATTERN, WRONG_BEHAVIOR, INEFFICIENCY, or MISCOMMUNICATION.
4. Save the analysis to `sessions/patterns-YYYY-MM-DD.md`.
5. Suggest what should be added to AGENTS.md or as a new skill.

### Updating AGENTS.md

When I say "update AGENTS.md" or "apply patterns":

1. Read the most recent pattern analysis from `sessions/`.
2. For each pattern, decide: belongs in AGENTS.md? Belongs as a skill? One-time issue?
3. Propose specific edits to this file with: exact text to add, which pattern prompted it, and where it goes.
4. Do NOT remove existing entries unless they contradict what I've said recently.

### Creating a Skill

When I say "create a skill for X":

1. Read existing skills in `skills/universal/` to match format.
2. Create a new file `skills/universal/[name].md` with:
   - Frontmatter: `description` with trigger keywords (what the user says, not what the skill does), optional `requires` for prerequisites.
   - Body: context, step-by-step instructions, examples of good output, do/don't lists.
3. The description is the most important part. It should list natural language trigger phrases.

### Reviewing the Setup

When I say "review setup" or "audit config":

1. Read this file, all skills, and the most recent pattern analysis.
2. Check: is each item still accurate? In the right place? Effective?
3. Check: which patterns from the analysis haven't been addressed yet?
4. Check: are any skills overloaded and should be split?
5. Output a structured review with items to add, edit, remove, move, or split.
