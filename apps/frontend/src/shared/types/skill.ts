/**
 * Skills — file-based capability packs the user or model can invoke.
 *
 * Each skill is a folder under `<userData>/skills/<skill-id>/` containing a
 * `SKILL.md` file. The file is markdown with YAML frontmatter:
 *
 *     ---
 *     name: code-review
 *     description: Review the diff in the current task for quality issues.
 *     allowed-tools: [Read, Grep, Glob]
 *     disable-model-invocation: false
 *     ---
 *     # Body
 *
 *     The model reads the body as additional instructions when this skill is
 *     active. The body can reference other files in the same directory.
 *
 * In v1, skills are user-invoked from the Skills view (click "Run" to create
 * a new task pre-populated with the skill body). Model-invocation arrives in
 * v2 once the agent has a skill-routing layer.
 */

export interface SkillManifest {
  /** Stable id — kebab-case, also the folder name. */
  id: string;
  /** Display name. */
  name: string;
  /** One-line description shown in lists and tooltips. */
  description: string;
  /** Skill body in markdown. Loaded eagerly for v1 (small files). */
  body: string;
  /** Optional list of tools the skill is allowed to use (informational; UI shows this). */
  allowedTools?: string[];
  /** If true, hide from the slash-command picker even after enable. Useful for skills
   *  intended to be project-scoped or auto-triggered only. */
  disableModelInvocation?: boolean;
  /** Optional category/tag for filtering. */
  category?: string;
  /** Optional homepage / docs link. */
  homepage?: string;
}

export interface LoadedSkill {
  manifest: SkillManifest;
  /** Absolute path to the skill directory. */
  directory: string;
  /** True if user has enabled this skill. */
  enabled: boolean;
  /** Parse error if SKILL.md was malformed. */
  loadError?: string;
}
