# Audit: User Profile & Preferences

**Model used for audit**: deepseek-v4-flash-free (same as your usual — couldn't swap, noted)
**Date**: 2026-07-30
**Sources**: opencode agent config, AGENTS.md, projects, full conversation history

---

## What I Know About You

### Tech Stack
- **Languages**: TypeScript (primary), JavaScript
- **Frontend**: React, React Native, Expo, NativeWind/Tailwind, React Native Reanimated
- **Backend/Libraries**: Node.js, workflow/durable execution libraries
- **Tools**: opencode (agent harness), Babel (custom plugins), jsdoc/typedoc, git
- **Package manager**: npm (in projects), open to bun

### Development Patterns
- **Multi-agent orchestration** — you decompose work into specialized subagents (babel-plugin-dev, runtime-dev, serialization-dev, etc.) with a coordinator
- **Instruction-driven development** — you write detailed `.md` instruction files for agents, then have a reviewer agent audit and fix root causes in the instructions themselves
- **Root-cause fixing** — reviewer agent doesn't just patch code, it traces bugs to bad/missing instructions and fixes the source
- **Git hygiene** — feature branches, PRs, reviews, descriptive commits
- **Low temperature / high reasoning** — you set `temperature: 0.1` and high reasoning effort for precise work

### What You Value (observed, not stated)
1. **Correctness over speed** — your reviewer agent catches edge cases, circular refs, async consistency
2. **Clean API surfaces** — "make sure the API surface is clean and minimal"
3. **Lessons learned are first-class** — your existing AGENTS.md is entirely about recording cross-cutting patterns so mistakes don't repeat
4. **Async discipline** — `await` everywhere, no Promise leakage
5. **TypeScript done well** — not "Python-style" TypeScript
6. **Automation of meta-work** — you want the system to manage itself (this whole conversation)

### What You Don't Like (observed)
1. **Wasted ceremony** — "match ceremony to the task" is already in your orchestrator
2. **Spawn-happy agents** — sub-agents editing same files, parallel collisions
3. **Run.sh / shell wrappers** — you want pure markdown, agent handles execution
4. **Over-building** — "don't just build stuff" / don't build infrastructure before you need it
5. **Model-specific config that doesn't transfer** — you want patterns that work with dumber models too

### Blind Spots (things not in your current config that would help)
1. No global AGENTS.md — only project-specific
2. No "questions are read-only" guardrail (models like deepsek-v4 tend to act when you ask)
3. No skill system yet — you only have agent instruction files
4. No glossary of terms (you/we/user/agent — useful for multi-agent setups)
5. No explicit "don't spin up dev servers" rule
6. No "instructions are good defaults, not hard rules" safety valve

### Theo Patterns That Map Well to You
| Pattern | Match | Why |
|---------|-------|-----|
| Questions are read-only | High | Deepseek models are eager to act |
| Match ceremony to task | High | You already do this |
| Prefer targeted verification | High | TypeScript + lint first |
| Don't build unasked | High | Your orchestrator is already strict |
| Blast radius | High | You have remote-controlled agents |
| Instructions as good defaults | Medium | Could soften rigid agent instructions |
| Glossary | Medium | Multi-agent needs shared vocabulary |
| Skills with trigger keywords | High | Natural fit for your agent .md files |
