Yes. There are several meaningful capabilities in `SkillsMiddleware` that your simple `catalogue + findSkill` design would not automatically reproduce.

The important ones are:

1. **Three-level progressive disclosure, not just two-level**

Deep Agents supports:

```text
Level 1: metadata
  name + description
       ↓
Level 2: SKILL.md
  core workflow/instructions
       ↓
Level 3: bundled resources
  references/
  scripts/
  assets/
```

The skill can tell the agent to read additional files only when necessary. Scripts can also be executed without loading their entire contents into the context. [GitHub](https://github.com/langchain-ai/deepagents/blob/main/libs/deepagents/deepagents/middleware/skills.py?utm_source=chatgpt.com)

Your `findSkill()` approach can reproduce this, but you'd need to explicitly design something like:

```text
findSkill()
readSkillResource()
executeSkillScript()
```

2. **Skill layering / overrides**

This is probably the most useful capability you're missing.

You can configure:

```ts
sources: [
  "/skills/base/",
  "/skills/team/",
  "/skills/project/",
  "/skills/user/"
]
```

If the same skill exists in multiple sources, the later source wins. This gives you:

```text
base skill
   ↓ overridden by
team skill
   ↓ overridden by
project skill
   ↓ overridden by
user skill
```

Deep Agents explicitly supports this source ordering. [GitHub](https://github.com/langchain-ai/deepagents/blob/main/libs/deepagents/deepagents/middleware/skills.py?utm_source=chatgpt.com)

You could reproduce this with your DB by adding:

```text
scope
priority
tenantId
projectId
```

but it's something you'd have to implement yourself.

3. **Bundled resources**

A skill isn't necessarily just text.

The supported structure is:

```text
security-review/
├── SKILL.md
├── scripts/
│   └── check_dependencies.py
├── references/
│   └── security-guidelines.md
└── assets/
    └── config.json
```

The important design is that the LLM doesn't need all of this in context. `SKILL.md` tells it when to access the additional resource. [GitHub](https://github.com/langchain-ai/deepagentsjs/blob/main/examples/skills/skill-creator/SKILL.md?utm_source=chatgpt.com)

This is more powerful than:

```ts
findSkill("security-review") → string
```

because a skill becomes a **package**, not merely a prompt.

4. **`allowed_tools` metadata**

Skills can declare recommended/allowed tools in their metadata. It's currently marked experimental, but it's part of the SkillMetadata model. [GitHub](https://github.com/langchain-ai/deepagents/blob/main/libs/deepagents/deepagents/middleware/skills.py?utm_source=chatgpt.com)

For example:

```yaml
---
name: security-review
description: Review code for security vulnerabilities
allowed-tools: github_get_file github_get_diff
---
```

Your custom implementation could support the same concept, but you'd need to decide whether this is merely guidance to the LLM or an actual authorization constraint.

I would strongly recommend treating authorization separately rather than trusting skill metadata.

5. **Runtime reload/invalidation**

Built-in SkillsMiddleware caches the discovered metadata **per thread**, but provides an explicit invalidation mechanism:

```ts
await agent.updateState(config, {
  skillsMetadata: null
});
```

The next model call reloads the skill sources. [LangChain Reference Docs](https://reference.langchain.com/javascript/deepagents/index/createSkillsMiddleware?utm_source=chatgpt.com)

Your DB design can actually be better here because you control the cache/version semantics.

6. **Subagent inheritance**

This is another important one for your architecture.

A forked subagent inherits the parent's skills and prompt-producing middleware. An isolated/custom subagent can have its own skills configuration. [GitHub](https://github.com/langchain-ai/deepagentsjs/blob/main/libs/deepagents/src/middleware/subagents.ts?utm_source=chatgpt.com)

So:

```text
Parent
  skills: [base, code-review]
       │
       ├── fork
       │     └── inherits skills
       │
       └── isolated subagent
             └── independently configured skills
```

If you're using Deep Agents' subagent capabilities, your custom `findSkill` needs to explicitly define what happens when a subagent invokes it.

7. **Backend abstraction**

The middleware isn't actually tied to the OS filesystem. It operates through backend APIs, which means skills can already work with different Deep Agents backends. [GitHub](https://github.com/langchain-ai/deepagents/blob/main/libs/deepagents/deepagents/middleware/skills.py?utm_source=chatgpt.com)

This is the strongest argument for using the built-in middleware if you want your skill system to behave exactly like Deep Agents' native skill system.

---

For **your PR-review system**, I would make the decision like this:

```text
If skills are simply:
  name + description + instructions

        → catalogue + findSkill is simpler
```

```text
If skills are:
  instructions
  + references
  + scripts
  + assets
  + layered overrides
  + subagent inheritance

        → SkillsMiddleware is substantially more useful
```

And there is one particularly important point for your architecture: **don't build a custom skill backend just because the skills are stored in DB.** The middleware is explicitly backend-agnostic. You can keep the native Skill semantics while changing where the skill resources come from. [LangChain Reference Docs](https://reference.langchain.com/javascript/deepagents/index/createSkillsMiddleware?utm_source=chatgpt.com)

One current caveat: there have been bugs around `skillsMetadata` and parallel subagents in earlier Deep Agents JS releases, although fixes have subsequently landed. If you're evaluating this for production, pin a current version and test your exact fork/parallel-subagent topology. [GitHub](https://github.com/langchain-ai/deepagentsjs/releases?utm_source=chatgpt.com)

**My recommendation for your case:** use the native SkillsMiddleware semantics, but put a DB-backed/remote implementation underneath it. That preserves the capabilities above without making your application depend on physical skill files.


Yes. The key is that **you don't replace `SkillsMiddleware`; you replace the backend it reads skills from**.

Current Deep Agents JS exposes `createSkillsMiddleware({ backend, sources })`, and the middleware uses backend APIs rather than directly accessing the filesystem. [LangChain Reference Docs](https://reference.langchain.com/javascript/deepagents/index/createSkillsMiddleware?utm_source=chatgpt.com)

For example:

```ts
import {
  createDeepAgent,
  createSkillsMiddleware,
  type BackendProtocol,
} from "deepagents";

class DbSkillBackend implements BackendProtocol {
  async ls(path: string) {
    // Read skill catalogue from DB
  }

  async read(path: string) {
    // Read SKILL.md / reference files from DB
  }

  // implement remaining required BackendProtocol methods
}

const skillBackend = new DbSkillBackend(db);

const skillsMiddleware = createSkillsMiddleware({
  backend: skillBackend,
  sources: ["/skills/"],
});

const agent = createDeepAgent({
  model,
  middleware: [skillsMiddleware],
});
```

Your DB:

```text
skills
------------------------------------------------
id
name
description
content
version
enabled
```

The backend maps the virtual paths:

```text
/skills/
    /code-review/
        SKILL.md

    /security-review/
        SKILL.md
```

to DB records:

```text
GET /skills/code-review/SKILL.md
       ↓
SELECT content FROM skills
WHERE name = 'code-review'
```

Then the **native SkillsMiddleware continues doing all the useful work**:

```text
DbSkillBackend
      ↓
SkillsMiddleware
      ↓
skill metadata → system prompt
      ↓
LLM decides skill is needed
      ↓
read_file("/skills/code-review/SKILL.md")
      ↓
DbSkillBackend
      ↓
DB
      ↓
full skill
```

This preserves the native progressive-disclosure mechanism. [LangChain Reference Docs](https://reference.langchain.com/javascript/deepagents/index/createSkillsMiddleware?utm_source=chatgpt.com)

The important caveat is that `BackendProtocol` is a fairly broad filesystem abstraction. If your only requirement is "load `SKILL.md` from DB", implementing a complete backend may be unnecessary complexity.

For your architecture, I'd therefore consider a **thin virtual backend specifically for skills**, rather than trying to make your entire application's filesystem DB-backed:

```text
                  Deep Agent
                      │
          ┌───────────┴───────────┐
          │                       │
 SkillsMiddleware          FilesystemMiddleware
          │                       │
 DbSkillBackend             normal agent backend
          │
          ▼
      PostgreSQL
```

That gives you the native SkillsMiddleware behavior without exposing your GitHub repository through the same filesystem backend—which is particularly important given the isolation problem you were investigating.

One more thing: current JS `createSkillsMiddleware` caches the discovered skill metadata in agent state per thread. When the DB catalogue changes, you can invalidate it with:

```ts
await agent.updateState(config, {
  skillsMetadata: null,
});
```

The next model call reloads the sources. [LangChain Reference Docs](https://reference.langchain.com/javascript/deepagents/index/createSkillsMiddleware?utm_source=chatgpt.com)

So the architecture I'd use is:

```text
Postgres
   │
   │ skills + version + content
   ▼
DbSkillBackend
   │
   ▼
createSkillsMiddleware()
   │
   ├── catalogue → system prompt
   │
   └── read_skill → DB
   │
   ▼
Deep Agent
```

**No custom `findSkill` tool is necessary if you want to retain the native Deep Agents skill semantics.**



No. **You would not write one repository method per skill.** The backend should implement generic path resolution.

Deep Agents itself works this way: `SkillsMiddleware` calls `ls(sourcePath)` to discover all skill directories, then constructs each `SKILL.md` path dynamically and calls `downloadFiles()` for those paths. It does not know the skill names beforehand. [GitHub](https://github.com/langchain-ai/deepagents/blob/main/libs/deepagents/deepagents/middleware/skills.py?utm_source=chatgpt.com)

For example:

```text
/skills/
    java-review/
        SKILL.md
    security-review/
        SKILL.md
    spring-review/
        SKILL.md
    performance-review/
        SKILL.md
```

Your backend receives:

```ts
ls("/skills/")
```

and queries the DB generically:

```ts
async ls(path: string) {
    if (path !== "/skills/") {
        // resolve deeper virtual paths
    }

    const skills = await db.query(`
        SELECT name
        FROM skills
        WHERE enabled = true
    `);

    return {
        entries: skills.map(skill => ({
            path: `/skills/${skill.name}/`,
            is_dir: true
        }))
    };
}
```

Then SkillsMiddleware automatically generates:

```text
/skills/java-review/SKILL.md
/skills/security-review/SKILL.md
/skills/spring-review/SKILL.md
/skills/performance-review/SKILL.md
```

and calls your generic `downloadFiles()`:

```ts
async downloadFiles(paths: string[]) {
    const result = [];

    for (const path of paths) {
        const match = path.match(
            /^\/skills\/([^/]+)\/SKILL\.md$/
        );

        if (!match) {
            result.push({
                path,
                error: "File not found"
            });
            continue;
        }

        const skillName = match[1];

        const skill = await db.query(
            `SELECT content FROM skills
             WHERE name = $1
             AND enabled = true`,
            [skillName]
        );

        result.push({
            path,
            content: Buffer.from(skill.content),
        });
    }

    return result;
}
```

So adding:

```text
database:
security-review
```

requires **zero code changes**.

Adding:

```text
database:
docker-review
```

requires **zero code changes**.

Adding 1,000 skills requires **zero code changes**.

The important conceptual mapping is:

```text
Virtual path
/skills/{skillName}/SKILL.md
          │
          │ parse {skillName}
          ▼
Generic DB query
WHERE name = {skillName}
```

You can also make it more robust by using an ID rather than the name:

```text
/skills/{skillId}/SKILL.md
```

and keep `name`, `description`, `content`, `version`, etc. in the DB.

And importantly, **the middleware itself already performs the dynamic discovery**. It lists the source directory, finds all directories, and checks each for `SKILL.md`; you don't need to implement that discovery logic yourself. [GitHub](https://github.com/langchain-ai/deepagents/blob/main/libs/deepagents/deepagents/middleware/skills.py?utm_source=chatgpt.com)

So your custom backend only needs to answer generic filesystem operations:

```text
ls("/skills/")
        ↓
"give me all enabled skills"

downloadFiles([
   "/skills/java-review/SKILL.md",
   "/skills/security-review/SKILL.md",
   ...
])
        ↓
"give me the content for these skill paths"
```

That is exactly the abstraction you want.

One correction to my previous answer: **you don't need a custom `findSkill` tool to get this behavior.** Native `SkillsMiddleware` already does the catalogue → progressive disclosure → full `SKILL.md` retrieval flow. Your custom backend simply makes `/skills/...` a virtual filesystem backed by your DB. [LangChain Reference Docs](https://reference.langchain.com/javascript/deepagents/index/createSkillsMiddleware?utm_source=chatgpt.com)