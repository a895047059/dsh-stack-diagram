/**
 * dsh-stack-diagram — bundle the `stack-diagram` architecture-diagram skill into
 * the DeepSeek Harness as a global capability.
 *
 * Two contributions, both host-side:
 *
 * 1. A runtime skill registration on `ctx.skills` (the three.js-free registry in
 *    `@deepseek-ai/dsh-skill`). The body comes from `skill/SKILL.md` inside this
 *    package, and `resourceBase` points at `skill/` so every relative path the
 *    instructions mention — `assets/template.html`, `assets/fonts`,
 *    `references/geometry.md`, `scripts/build.py` — resolves without the model
 *    having to guess where the package lives.
 *
 * 2. One system-prompt section that states when the skill applies. Without it the
 *    skill only fires when the human names it; with it the model recognizes
 *    architecture / stack / topology / flow requests on its own. The section is
 *    deliberately short — routing only, no diagram know-how — because the skill
 *    body is what carries the method, and prompt budget is shared with the rest
 *    of the harness.
 *
 * @module dsh-stack-diagram
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_DIR = join(PACKAGE_ROOT, 'skill')
const SKILL_FILE = join(SKILL_DIR, 'SKILL.md')

export const name = 'stack-diagram'

/** Routing order: after the team policy (600), before PTC-only (800). */
const ROUTING_ORDER = 700

const ROUTING_TEXT = `# Architecture diagrams

When a task is about how software pieces fit together rather than about code
inside one of them, draw it instead of describing it in prose. Use the
\`stack-diagram\` skill for: architecture, system, stack, infra or deployment
diagrams; service topologies; data-flow or request-flow pictures; "what talks to
what" questions; anything the user wants to see as boxes, groups and arrows — in
any language, whether or not they name an output format.

Reach for it without being asked when the answer would otherwise be a wall of
service names and arrows in text, and when the diagram is the deliverable rather
than a decoy for one. Real brand logos plus labeled group boxes make a stack
diagram readable in a way a mermaid graph is not; pick mermaid instead when the
picture is a small algorithm or state machine, and a plain bullet list when there
are fewer than three connections to show.

The skill's scripts are Python 3.9+; PNG output also needs Playwright with
Chromium, which this machine has. Icons are fetched over the network on first use
and cached in the working directory.`

/** Split YAML frontmatter from the Markdown body; both halves are returned raw. */
function splitFrontmatter(raw) {
  if (!raw.startsWith('---')) return { frontmatter: '', body: raw }
  const end = raw.indexOf('\n---', 3)
  if (end < 0) return { frontmatter: '', body: raw }
  const closing = raw.indexOf('\n', end + 1)
  return {
    frontmatter: raw.slice(raw.indexOf('\n', 3) + 1, end),
    body: raw.slice(closing < 0 ? raw.length : closing + 1),
  }
}

/**
 * Minimal frontmatter reader for the flat `key: value` block this skill ships.
 * Deliberately not a YAML parser: the body is authoritative, and a plugin that
 * drags in a YAML dependency to read four strings is a plugin that will break
 * when the profile reinstalls its tree.
 */
function readFrontmatter(text) {
  const fields = {}
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const at = line.indexOf(':')
    if (at <= 0) continue
    const key = line.slice(0, at).trim()
    let value = line.slice(at + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1)
    }
    fields[key] = value
  }
  return fields
}

function loadSkill() {
  const raw = readFileSync(SKILL_FILE, 'utf8')
  const { frontmatter, body } = splitFrontmatter(raw)
  const fields = readFrontmatter(frontmatter)
  const skillName = fields.name
  const description = fields.description
  if (typeof skillName !== 'string' || skillName.length === 0) {
    throw new Error(`stack-diagram: ${SKILL_FILE} has no frontmatter name`)
  }
  if (typeof description !== 'string' || description.length === 0) {
    throw new Error(`stack-diagram: ${SKILL_FILE} has no frontmatter description`)
  }
  return {
    name: skillName,
    description,
    source: SKILL_FILE,
    content: body.trimStart(),
    provider: 'dsh-stack-diagram',
    path: SKILL_FILE,
    resourceBase: { kind: 'directory', path: SKILL_DIR },
    metadata: { license: fields.license, compatibility: fields.compatibility },
  }
}

/**
 * Register the bundled skill and its routing section.
 *
 * Failures are logged and swallowed per contribution: a broken SKILL.md should
 * cost the profile its diagram skill, not the whole plugin tree. The loader keeps
 * the row mounted either way, and the reason lands in the host log.
 */
function apply(ctx) {
  try {
    ctx.skills.register(loadSkill())
  } catch (error) {
    ctx.logger?.warn?.(`stack-diagram: skill registration skipped: ${error?.message ?? error}`)
  }

  try {
    ctx.systemPrompt.section({
      name: 'deployment:stack-diagram-routing',
      order: ROUTING_ORDER,
      text: ROUTING_TEXT,
    })
  } catch (error) {
    ctx.logger?.warn?.(`stack-diagram: routing section skipped: ${error?.message ?? error}`)
  }
}

/**
 * The harness loader unwraps `exports.default ?? exports` before applying a
 * plugin, so `inject` has to live on the applied function itself — a named
 * `export const inject` is dropped on the floor and the first `ctx.skills`
 * access throws "cannot get property \"skills\" without inject".
 */
apply.inject = ['skills', 'systemPrompt']

export default apply
