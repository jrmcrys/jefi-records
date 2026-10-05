import type { McpServer } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { clientFor } from "./auth";
import {
  DEFAULT_TZ,
  htmlFromText,
  parseDue,
  plainText,
  sanitizeSearch,
  type Person,
} from "./helpers";

/* Tools for the Claude connector. Each call runs as the signed-in person
   through their own access token, so private projects stay private and every
   change is attributed to them. */

type Ctx = { http?: { authInfo?: { token: string; extra?: Record<string, unknown> } } };
type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (value: unknown): Result => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});
const fail = (message: string): Result => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

class ToolError extends Error {}

function session(ctx: Ctx): { sb: SupabaseClient; me: string } {
  const info = ctx.http?.authInfo;
  const me = info?.extra?.userId;
  if (!info?.token || typeof me !== "string") throw new ToolError("Not signed in.");
  return { sb: clientFor(info.token), me };
}

function run<A>(handler: (args: A, s: { sb: SupabaseClient; me: string }) => Promise<unknown>) {
  return async (args: A, ctx: Ctx): Promise<Result> => {
    try {
      return ok(await handler(args, session(ctx)));
    } catch (e) {
      if (e instanceof ToolError) return fail(e.message);
      return fail(e instanceof Error ? e.message : "Something went wrong.");
    }
  };
}

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new ToolError(`${what}: ${r.error.message}`);
  if (r.data === null) throw new ToolError(`${what}: not found, or you do not have access.`);
  return r.data;
}

function rows<T>(r: { data: T[] | null; error: { message: string } | null }, what: string): T[] {
  if (r.error) throw new ToolError(`${what}: ${r.error.message}`);
  return r.data ?? [];
}

/* lookups */

type Project = { id: string; name: string; visibility: string; archived: boolean; created_by: string };
type Status = { id: string; project_id: string; name: string; is_done: boolean; position: number };

async function people(sb: SupabaseClient): Promise<(Person & { email: string })[]> {
  return rows(await sb.from("profiles").select("id,name,email"), "Could not load people");
}

function personId(list: (Person & { email: string })[], me: string, ref: string): string {
  const q = ref.trim().toLowerCase();
  if (q === "me") return me;
  const hit = list.find((p) => p.name.toLowerCase() === q || p.email.toLowerCase() === q);
  if (!hit) {
    throw new ToolError(`No person called "${ref}". Known people: ${list.map((p) => p.name).join(", ")}.`);
  }
  return hit.id;
}

async function projectByRef(sb: SupabaseClient, ref: string): Promise<Project> {
  const all = rows(
    await sb.from("projects").select("id,name,visibility,archived,created_by"),
    "Could not load projects"
  ) as Project[];
  const byId = all.find((p) => p.id === ref);
  if (byId) return byId;
  const matches = all.filter((p) => p.name.toLowerCase() === ref.trim().toLowerCase());
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new ToolError(`More than one project is called "${ref}". Use its id.`);
  }
  throw new ToolError(`No project "${ref}" that you can see. Use list_projects.`);
}

async function statusesOf(sb: SupabaseClient, projectId: string): Promise<Status[]> {
  return rows(
    await sb
      .from("project_statuses")
      .select("id,project_id,name,is_done,position")
      .eq("project_id", projectId)
      .order("position"),
    "Could not load statuses"
  ) as Status[];
}

function statusId(statuses: Status[], name: string): string {
  const hit = statuses.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
  if (!hit) throw new ToolError(`No status "${name}" in this project. Options: ${statuses.map((s) => s.name).join(", ")}.`);
  return hit.id;
}

const TASK_FIELDS =
  "id,project_id,section_id,parent_task_id,name,status_id,assignee_id,due_at,due_has_time,recurrence,completed_at,created_at";

type TaskRow = {
  id: string;
  project_id: string;
  section_id: string | null;
  parent_task_id: string | null;
  name: string;
  status_id: string | null;
  assignee_id: string | null;
  due_at: string | null;
  due_has_time: boolean;
  recurrence: unknown;
  completed_at: string | null;
  created_at: string;
  description?: string;
};

async function describeTasks(sb: SupabaseClient, list: TaskRow[]) {
  const ids = list.map((t) => t.id);
  const projectIds = [...new Set(list.map((t) => t.project_id))];
  const [projects, statuses, profiles, links, tags] = await Promise.all([
    projectIds.length ? sb.from("projects").select("id,name").in("id", projectIds) : { data: [], error: null },
    projectIds.length ? sb.from("project_statuses").select("id,name").in("project_id", projectIds) : { data: [], error: null },
    sb.from("profiles").select("id,name"),
    ids.length ? sb.from("task_tags").select("task_id,tag_id").in("task_id", ids) : { data: [], error: null },
    sb.from("tags").select("id,name"),
  ]);
  const pn = new Map((rows(projects, "projects") as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const sn = new Map((rows(statuses, "statuses") as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const un = new Map((rows(profiles, "people") as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const tn = new Map((rows(tags, "tags") as { id: string; name: string }[]).map((t) => [t.id, t.name]));
  const tagsOf = new Map<string, string[]>();
  for (const l of rows(links, "task tags") as { task_id: string; tag_id: string }[]) {
    const name = tn.get(l.tag_id);
    if (name) tagsOf.set(l.task_id, [...(tagsOf.get(l.task_id) ?? []), name]);
  }
  return list.map((t) => ({
    id: t.id,
    name: t.name,
    project: pn.get(t.project_id) ?? t.project_id,
    project_id: t.project_id,
    parent_task_id: t.parent_task_id,
    status: t.status_id ? sn.get(t.status_id) ?? null : null,
    assignee: t.assignee_id ? un.get(t.assignee_id) ?? null : null,
    due: t.due_at ? (t.due_has_time ? t.due_at : t.due_at.slice(0, 10)) : null,
    repeats: t.recurrence ?? null,
    completed_at: t.completed_at,
    tags: tagsOf.get(t.id) ?? [],
  }));
}

async function sectionId(sb: SupabaseClient, projectId: string, name: string | undefined): Promise<string | null> {
  if (!name) return null;
  const all = rows(
    await sb.from("sections").select("id,name").eq("project_id", projectId),
    "Could not load sections"
  ) as { id: string; name: string }[];
  const hit = all.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
  if (!hit) throw new ToolError(`No section "${name}" in this project. Sections: ${all.map((s) => s.name).join(", ") || "none"}.`);
  return hit.id;
}

async function nextPosition(sb: SupabaseClient, table: "tasks" | "sections", filter: Record<string, string | null>) {
  let q = sb.from(table).select("position").order("position", { ascending: false }).limit(1);
  for (const [k, v] of Object.entries(filter)) q = v === null ? q.is(k, null) : q.eq(k, v);
  const top = rows(await q, "position") as { position: number }[];
  return (top[0]?.position ?? 0) + 1000;
}

async function findOrCreateTag(sb: SupabaseClient, name: string, color?: string) {
  const clean = name.trim();
  if (!clean) throw new ToolError("Tag name is empty.");
  const all = rows(await sb.from("tags").select("id,name,color"), "Could not load tags") as { id: string; name: string; color: string }[];
  const hit = all.find((t) => t.name.toLowerCase() === clean.toLowerCase());
  if (hit) return hit;
  const created = must(
    await sb.from("tags").insert({ name: clean, color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : "#2563eb" }).select("id,name,color").single(),
    "Could not create the tag"
  );
  return created as unknown as { id: string; name: string; color: string };
}

type FieldDef = { id: string; name: string; type: string; options: { id: string; name: string }[] };

async function fieldValuesFor(
  sb: SupabaseClient,
  projectId: string,
  input: Record<string, unknown>,
  list: (Person & { email: string })[],
  me: string
): Promise<{ field_id: string; value: unknown }[]> {
  const defs = rows(
    await sb.from("field_definitions").select("id,name,type,options").eq("project_id", projectId),
    "Could not load columns"
  ) as FieldDef[];
  const out: { field_id: string; value: unknown }[] = [];
  for (const [fieldName, raw] of Object.entries(input)) {
    const def = defs.find((d) => d.name.toLowerCase() === fieldName.trim().toLowerCase());
    if (!def) throw new ToolError(`No column "${fieldName}" in this project. Columns: ${defs.map((d) => d.name).join(", ") || "none"}.`);
    const optionId = (n: unknown) => {
      const hit = def.options.find((o) => o.name.toLowerCase() === String(n).trim().toLowerCase());
      if (!hit) throw new ToolError(`"${n}" is not an option of "${def.name}". Options: ${def.options.map((o) => o.name).join(", ")}.`);
      return hit.id;
    };
    let value: unknown;
    switch (def.type) {
      case "text":
      case "url":
        value = raw === null ? null : String(raw);
        break;
      case "number":
        value = raw === null ? null : Number(raw);
        if (value !== null && !Number.isFinite(value)) throw new ToolError(`"${def.name}" needs a number.`);
        break;
      case "checkbox":
        value = raw === true || raw === "true";
        break;
      case "dropdown":
        value = raw === null ? null : optionId(raw);
        break;
      case "multi_select":
        value = Array.isArray(raw) ? raw.map(optionId) : raw === null ? [] : [optionId(raw)];
        break;
      case "person":
        value = raw === null ? null : personId(list, me, String(raw));
        break;
      default:
        throw new ToolError(`Column type "${def.type}" is not supported.`);
    }
    out.push({ field_id: def.id, value });
  }
  return out;
}

async function saveFieldValues(sb: SupabaseClient, taskId: string, values: { field_id: string; value: unknown }[]) {
  if (!values.length) return;
  const { error } = await sb
    .from("task_field_values")
    .upsert(values.map((v) => ({ task_id: taskId, ...v })), { onConflict: "task_id,field_id" });
  if (error) throw new ToolError(`Could not save column values: ${error.message}`);
}

/* schemas shared between tools */

const dueDoc =
  "A date as YYYY-MM-DD, or a date and time as YYYY-MM-DDTHH:MM with an offset such as +08:00 (Philippine time is assumed when there is no offset).";
const repeatSchema = z
  .object({
    freq: z.enum(["daily", "weekly", "monthly", "yearly"]),
    interval: z.number().int().min(1).max(365).default(1),
    days: z.array(z.number().int().min(0).max(6)).optional().describe("Weekly only. 0 is Sunday, 6 is Saturday."),
    until: z.string().optional().describe("Stop repeating after this date, YYYY-MM-DD."),
    timezone: z.string().optional().describe(`IANA time zone, default ${DEFAULT_TZ}.`),
  })
  .describe("When a repeating task is completed, the next copy is created automatically.");

type Repeat = z.infer<typeof repeatSchema>;

function recurrenceJson(r: Repeat) {
  return {
    freq: r.freq,
    interval: r.interval ?? 1,
    days: r.freq === "weekly" ? r.days ?? [] : [],
    until: r.until ?? null,
    tz: r.timezone ?? DEFAULT_TZ,
  };
}

export function registerTools(server: McpServer) {
  /* read */

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List the projects you can see (your private ones and the shared ones).",
      inputSchema: z.object({ include_archived: z.boolean().optional() }),
      annotations: { readOnlyHint: true },
    },
    run(async ({ include_archived }: { include_archived?: boolean }, { sb }) => {
      const [projects, profiles] = await Promise.all([
        sb.from("projects").select("id,name,visibility,archived,created_by").order("position"),
        people(sb),
      ]);
      const owner = new Map(profiles.map((p) => [p.id, p.name]));
      return (rows(projects, "Could not load projects") as Project[])
        .filter((p) => include_archived || !p.archived)
        .map((p) => ({ id: p.id, name: p.name, visibility: p.visibility, archived: p.archived, owner: owner.get(p.created_by) ?? null }));
    })
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description:
        "List tasks, newest due date first among those with dates. Filter by project, status, assignee, tag, or due range. Open tasks only unless include_completed is true.",
      inputSchema: z.object({
        project: z.string().optional().describe("Project name or id."),
        status: z.string().optional(),
        assignee: z.string().optional().describe('A person\'s name or email, "me", or "unassigned".'),
        tag: z.string().optional(),
        due_after: z.string().optional().describe("YYYY-MM-DD, inclusive."),
        due_before: z.string().optional().describe("YYYY-MM-DD, inclusive."),
        include_completed: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    run(async (a: { project?: string; status?: string; assignee?: string; tag?: string; due_after?: string; due_before?: string; include_completed?: boolean; limit?: number }, { sb, me }) => {
      let q = sb.from("tasks").select(TASK_FIELDS);
      if (a.project) {
        const p = await projectByRef(sb, a.project);
        q = q.eq("project_id", p.id);
        if (a.status) q = q.eq("status_id", statusId(await statusesOf(sb, p.id), a.status));
      } else if (a.status) {
        const hits = rows(await sb.from("project_statuses").select("id").ilike("name", a.status.trim()), "statuses") as { id: string }[];
        if (!hits.length) return [];
        q = q.in("status_id", hits.map((h) => h.id));
      }
      if (a.assignee) {
        if (a.assignee.trim().toLowerCase() === "unassigned") q = q.is("assignee_id", null);
        else q = q.eq("assignee_id", personId(await people(sb), me, a.assignee));
      }
      if (a.tag) {
        const t = (rows(await sb.from("tags").select("id,name"), "tags") as { id: string; name: string }[]).find(
          (x) => x.name.toLowerCase() === a.tag!.trim().toLowerCase()
        );
        if (!t) return [];
        const ids = (rows(await sb.from("task_tags").select("task_id").eq("tag_id", t.id), "task tags") as { task_id: string }[]).map((r) => r.task_id);
        if (!ids.length) return [];
        q = q.in("id", ids);
      }
      if (!a.include_completed) q = q.is("completed_at", null);
      if (a.due_after) {
        const d = parseDue(a.due_after);
        if ("error" in d) throw new ToolError(d.error);
        q = q.gte("due_at", `${a.due_after.slice(0, 10)}T00:00:00.000Z`);
      }
      if (a.due_before) {
        const d = parseDue(a.due_before);
        if ("error" in d) throw new ToolError(d.error);
        q = q.lte("due_at", `${a.due_before.slice(0, 10)}T23:59:59.999Z`);
      }
      const list = rows(await q.order("due_at", { ascending: true, nullsFirst: false }).limit(a.limit ?? 100), "Could not load tasks") as TaskRow[];
      return describeTasks(sb, list);
    })
  );

  server.registerTool(
    "search_tasks",
    {
      title: "Search tasks",
      description: "Find tasks whose name or description contains the text.",
      inputSchema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(50).optional() }),
      annotations: { readOnlyHint: true },
    },
    run(async ({ query, limit }: { query: string; limit?: number }, { sb }) => {
      const safe = sanitizeSearch(query);
      if (!safe) throw new ToolError("Search text is empty.");
      const list = rows(
        await sb.from("tasks").select(TASK_FIELDS).or(`name.ilike.*${safe}*,description.ilike.*${safe}*`).limit(limit ?? 25),
        "Search failed"
      ) as TaskRow[];
      return describeTasks(sb, list);
    })
  );

  server.registerTool(
    "get_task",
    {
      title: "Get a task",
      description: "Everything about one task: details, description, custom column values, subtasks, and comments.",
      inputSchema: z.object({ task_id: z.string() }),
      annotations: { readOnlyHint: true },
    },
    run(async ({ task_id }: { task_id: string }, { sb }) => {
      const task = must(await sb.from("tasks").select(`${TASK_FIELDS},description`).eq("id", task_id).maybeSingle(), "Task") as TaskRow;
      const [described, subs, comments, values, defs, profiles] = await Promise.all([
        describeTasks(sb, [task]),
        sb.from("tasks").select(TASK_FIELDS).eq("parent_task_id", task_id).order("position"),
        sb.from("comments").select("id,author_id,body,created_at").eq("task_id", task_id).order("created_at"),
        sb.from("task_field_values").select("field_id,value").eq("task_id", task_id),
        sb.from("field_definitions").select("id,name,type,options").eq("project_id", task.project_id),
        people(sb),
      ]);
      const name = new Map(profiles.map((p) => [p.id, p.name]));
      const fieldDefs = rows(defs, "columns") as FieldDef[];
      const custom: Record<string, unknown> = {};
      for (const v of rows(values, "values") as { field_id: string; value: unknown }[]) {
        const def = fieldDefs.find((d) => d.id === v.field_id);
        if (!def) continue;
        const label = (id: unknown) => def.options.find((o) => o.id === id)?.name ?? id;
        custom[def.name] =
          def.type === "dropdown" ? label(v.value)
          : def.type === "multi_select" && Array.isArray(v.value) ? v.value.map(label)
          : def.type === "person" ? name.get(String(v.value)) ?? v.value
          : v.value;
      }
      return {
        ...described[0],
        description: plainText(task.description),
        columns: custom,
        subtasks: await describeTasks(sb, rows(subs, "subtasks") as TaskRow[]),
        comments: (rows(comments, "comments") as { id: string; author_id: string; body: string; created_at: string }[]).map((c) => ({
          id: c.id,
          author: name.get(c.author_id) ?? "Unknown",
          at: c.created_at,
          text: plainText(c.body),
        })),
      };
    })
  );

  server.registerTool(
    "list_tags",
    {
      title: "List tags",
      description: "List all tags, and whether you follow each one.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    run(async (_a: Record<string, never>, { sb, me }) => {
      const [tags, follows] = await Promise.all([
        sb.from("tags").select("id,name,color").order("name"),
        sb.from("tag_follows").select("tag_id").eq("user_id", me),
      ]);
      const followed = new Set((rows(follows, "follows") as { tag_id: string }[]).map((f) => f.tag_id));
      return (rows(tags, "tags") as { id: string; name: string; color: string }[]).map((t) => ({ ...t, followed_by_me: followed.has(t.id) }));
    })
  );

  server.registerTool(
    "list_notifications",
    {
      title: "List notifications",
      description: "Your inbox: mentions, assignments, and followed-tag activity. Unread only by default.",
      inputSchema: z.object({ unread_only: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional() }),
      annotations: { readOnlyHint: true },
    },
    run(async ({ unread_only, limit }: { unread_only?: boolean; limit?: number }, { sb, me }) => {
      let q = sb
        .from("notifications")
        .select("id,type,task_id,actor_id,read_at,created_at,data,task:tasks(name)")
        .eq("user_id", me)
        .order("created_at", { ascending: false })
        .limit(limit ?? 30);
      if (unread_only !== false) q = q.is("read_at", null);
      const [list, profiles] = await Promise.all([q, people(sb)]);
      const name = new Map(profiles.map((p) => [p.id, p.name]));
      return (rows(list, "Could not load notifications") as unknown as {
        id: string; type: string; task_id: string | null; actor_id: string | null; read_at: string | null; created_at: string;
        data: { kind?: string; tag?: string; snippet?: string } | null; task: { name: string } | null;
      }[]).map((n) => ({
        id: n.id,
        type: n.type,
        kind: n.data?.kind ?? null,
        by: n.actor_id ? name.get(n.actor_id) ?? null : null,
        task_id: n.task_id,
        task: n.task?.name ?? null,
        tag: n.data?.tag ?? null,
        snippet: n.data?.snippet ?? null,
        at: n.created_at,
        read: Boolean(n.read_at),
      }));
    })
  );

  /* create and edit */

  const taskInput = {
    description: z.string().optional().describe("Plain text. Write @Name to mention a person."),
    assignee: z.string().optional().describe('A person\'s name or email, or "me".'),
    due: z.string().optional().describe(dueDoc),
    status: z.string().optional(),
    tags: z.array(z.string()).optional().describe("Tag names. Missing tags are created."),
    columns: z.record(z.string(), z.unknown()).optional().describe("Custom column values by column name. Dropdowns take the option name."),
    repeat: repeatSchema.optional(),
  };
  type TaskInput = {
    description?: string; assignee?: string; due?: string; status?: string; tags?: string[];
    columns?: Record<string, unknown>; repeat?: Repeat;
  };

  async function createTaskRow(
    s: { sb: SupabaseClient; me: string },
    base: { project_id: string; section_id: string | null; parent_task_id: string | null; name: string },
    a: TaskInput
  ) {
    const { sb, me } = s;
    const list = await people(sb);
    const statuses = await statusesOf(sb, base.project_id);
    const row: Record<string, unknown> = {
      ...base,
      status_id: a.status ? statusId(statuses, a.status) : statuses.find((x) => !x.is_done)?.id ?? statuses[0]?.id ?? null,
      position: await nextPosition(sb, "tasks", { project_id: base.project_id, parent_task_id: base.parent_task_id, section_id: base.section_id }),
    };
    if (a.description) {
      const { html, mentions } = htmlFromText(a.description, list);
      row.description = html;
      void mentions;
    }
    if (a.assignee) row.assignee_id = personId(list, me, a.assignee);
    if (a.due) {
      const d = parseDue(a.due);
      if ("error" in d) throw new ToolError(d.error);
      Object.assign(row, d);
    }
    if (a.repeat) {
      if (!row.due_at) throw new ToolError("A repeating task needs a due date.");
      row.recurrence = recurrenceJson(a.repeat);
    }
    const columnValues = a.columns ? await fieldValuesFor(sb, base.project_id, a.columns, list, me) : [];
    const created = must(await sb.from("tasks").insert(row).select(TASK_FIELDS).single(), "Could not create the task") as TaskRow;
    await saveFieldValues(sb, created.id, columnValues);
    for (const name of a.tags ?? []) {
      const tag = await findOrCreateTag(sb, name);
      const { error } = await sb.from("task_tags").insert({ task_id: created.id, tag_id: tag.id });
      if (error && !/duplicate/i.test(error.message)) throw new ToolError(`Could not add tag "${name}": ${error.message}`);
    }
    return (await describeTasks(sb, [created]))[0];
  }

  server.registerTool(
    "create_task",
    {
      title: "Create a task",
      description: "Add a task to a project, optionally in a named section.",
      inputSchema: z.object({
        project: z.string().describe("Project name or id."),
        name: z.string().min(1).max(500),
        section: z.string().optional().describe("Section name."),
        ...taskInput,
      }),
    },
    run(async (a: { project: string; name: string; section?: string } & TaskInput, s) => {
      const p = await projectByRef(s.sb, a.project);
      if (p.archived) throw new ToolError("That project is archived.");
      return createTaskRow(s, { project_id: p.id, section_id: await sectionId(s.sb, p.id, a.section), parent_task_id: null, name: a.name.trim() }, a);
    })
  );

  server.registerTool(
    "create_subtask",
    {
      title: "Create a subtask",
      description: "Add a subtask under an existing task.",
      inputSchema: z.object({ parent_task_id: z.string(), name: z.string().min(1).max(500), ...taskInput }),
    },
    run(async (a: { parent_task_id: string; name: string } & TaskInput, s) => {
      const parent = must(await s.sb.from("tasks").select("id,project_id,section_id,parent_task_id").eq("id", a.parent_task_id).maybeSingle(), "Parent task") as TaskRow;
      if (parent.parent_task_id) throw new ToolError("Subtasks go one level deep. Pick a top-level task as the parent.");
      return createTaskRow(s, { project_id: parent.project_id, section_id: parent.section_id, parent_task_id: parent.id, name: a.name.trim() }, a);
    })
  );

  server.registerTool(
    "update_task",
    {
      title: "Update a task",
      description:
        'Change any field of a task. Pass null for assignee, due, or repeat to clear them. Setting a status marked as done also completes the task.',
      inputSchema: z.object({
        task_id: z.string(),
        name: z.string().min(1).max(500).optional(),
        description: z.string().nullable().optional().describe("Plain text; replaces the whole description. Write @Name to mention a person."),
        assignee: z.string().nullable().optional(),
        due: z.string().nullable().optional().describe(dueDoc),
        status: z.string().optional(),
        columns: z.record(z.string(), z.unknown()).optional().describe("Custom column values by column name; null clears."),
        repeat: repeatSchema.nullable().optional(),
      }),
    },
    run(async (a: { task_id: string; name?: string; description?: string | null; assignee?: string | null; due?: string | null; status?: string; columns?: Record<string, unknown>; repeat?: Repeat | null }, { sb, me }) => {
      const task = must(await sb.from("tasks").select(TASK_FIELDS).eq("id", a.task_id).maybeSingle(), "Task") as TaskRow;
      const list = await people(sb);
      const patch: Record<string, unknown> = {};
      if (a.name !== undefined) patch.name = a.name.trim();
      if (a.description !== undefined) patch.description = a.description ? htmlFromText(a.description, list).html : "";
      if (a.assignee !== undefined) patch.assignee_id = a.assignee === null ? null : personId(list, me, a.assignee);
      if (a.due !== undefined) {
        if (a.due === null) Object.assign(patch, { due_at: null, due_has_time: false });
        else {
          const d = parseDue(a.due);
          if ("error" in d) throw new ToolError(d.error);
          Object.assign(patch, d);
        }
      }
      if (a.repeat !== undefined) {
        if (a.repeat === null) patch.recurrence = null;
        else {
          const dueAfter = "due_at" in patch ? patch.due_at : task.due_at;
          if (!dueAfter) throw new ToolError("A repeating task needs a due date.");
          patch.recurrence = recurrenceJson(a.repeat);
        }
      }
      if (a.status) {
        const statuses = await statusesOf(sb, task.project_id);
        const id = statusId(statuses, a.status);
        const done = statuses.find((s) => s.id === id)?.is_done ?? false;
        patch.status_id = id;
        patch.completed_at = done ? task.completed_at ?? new Date().toISOString() : null;
      }
      const columnValues = a.columns ? await fieldValuesFor(sb, task.project_id, a.columns, list, me) : [];
      if (Object.keys(patch).length) {
        must(await sb.from("tasks").update(patch).eq("id", a.task_id).select("id").maybeSingle(), "Could not update the task");
      }
      await saveFieldValues(sb, a.task_id, columnValues);
      const fresh = must(await sb.from("tasks").select(TASK_FIELDS).eq("id", a.task_id).maybeSingle(), "Task") as TaskRow;
      return (await describeTasks(sb, [fresh]))[0];
    })
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete or reopen a task",
      description: "Mark a task done (moves it to the project's done status) or reopen it. Completing a repeating task creates its next copy.",
      inputSchema: z.object({ task_id: z.string(), completed: z.boolean().optional().describe("Default true. False reopens it.") }),
    },
    run(async ({ task_id, completed }: { task_id: string; completed?: boolean }, { sb }) => {
      const task = must(await sb.from("tasks").select(TASK_FIELDS).eq("id", task_id).maybeSingle(), "Task") as TaskRow;
      const statuses = await statusesOf(sb, task.project_id);
      const finish = completed !== false;
      const target = finish ? statuses.find((s) => s.is_done) : statuses.find((s) => !s.is_done);
      const patch = {
        status_id: target?.id ?? task.status_id,
        completed_at: finish ? task.completed_at ?? new Date().toISOString() : null,
      };
      must(await sb.from("tasks").update(patch).eq("id", task_id).select("id").maybeSingle(), "Could not update the task");
      const fresh = must(await sb.from("tasks").select(TASK_FIELDS).eq("id", task_id).maybeSingle(), "Task") as TaskRow;
      return (await describeTasks(sb, [fresh]))[0];
    })
  );

  server.registerTool(
    "add_tag",
    {
      title: "Add a tag to a task",
      description: "Attach a tag by name. The tag is created if it does not exist yet.",
      inputSchema: z.object({ task_id: z.string(), tag: z.string().min(1).max(60), color: z.string().optional().describe("Hex color for a new tag, such as #16a34a.") }),
    },
    run(async ({ task_id, tag, color }: { task_id: string; tag: string; color?: string }, { sb }) => {
      must(await sb.from("tasks").select("id").eq("id", task_id).maybeSingle(), "Task");
      const t = await findOrCreateTag(sb, tag, color);
      const { error } = await sb.from("task_tags").insert({ task_id, tag_id: t.id });
      if (error && !/duplicate/i.test(error.message)) throw new ToolError(`Could not add the tag: ${error.message}`);
      return `Tag "${t.name}" is on the task.`;
    })
  );

  server.registerTool(
    "remove_tag",
    {
      title: "Remove a tag from a task",
      description: "Detach a tag from a task. The tag itself stays.",
      inputSchema: z.object({ task_id: z.string(), tag: z.string().min(1) }),
    },
    run(async ({ task_id, tag }: { task_id: string; tag: string }, { sb }) => {
      const t = (rows(await sb.from("tags").select("id,name"), "tags") as { id: string; name: string }[]).find((x) => x.name.toLowerCase() === tag.trim().toLowerCase());
      if (!t) throw new ToolError(`No tag "${tag}".`);
      const { error } = await sb.from("task_tags").delete().eq("task_id", task_id).eq("tag_id", t.id);
      if (error) throw new ToolError(`Could not remove the tag: ${error.message}`);
      return `Tag "${t.name}" is off the task.`;
    })
  );

  server.registerTool(
    "create_project",
    {
      title: "Create a project",
      description: "Create a project you own. Shared projects are visible to and editable by both people; private ones only to you.",
      inputSchema: z.object({ name: z.string().min(1).max(120), visibility: z.enum(["public", "private"]).optional().describe("Default public.") }),
    },
    run(async ({ name, visibility }: { name: string; visibility?: "public" | "private" }, { sb }) => {
      const top = (rows(await sb.from("projects").select("position").order("position", { ascending: false }).limit(1), "projects") as { position: number }[])[0]?.position ?? 0;
      const p = must(
        await sb.from("projects").insert({ name: name.trim(), visibility: visibility ?? "public", position: top + 1000 }).select("id,name,visibility").single(),
        "Could not create the project"
      );
      return p;
    })
  );

  server.registerTool(
    "create_section",
    {
      title: "Create a section",
      description: "Add a named section to a project.",
      inputSchema: z.object({ project: z.string().describe("Project name or id."), name: z.string().min(1).max(120) }),
    },
    run(async ({ project, name }: { project: string; name: string }, { sb }) => {
      const p = await projectByRef(sb, project);
      const position = await nextPosition(sb, "sections", { project_id: p.id });
      return must(
        await sb.from("sections").insert({ project_id: p.id, name: name.trim(), position }).select("id,name").single(),
        "Could not create the section"
      );
    })
  );

  /* comment */

  server.registerTool(
    "add_comment",
    {
      title: "Comment on a task",
      description:
        "Post a comment as you. Write @Name for a person to mention them; they get the same notification as in the app.",
      inputSchema: z.object({ task_id: z.string(), text: z.string().min(1).max(10000) }),
    },
    run(async ({ task_id, text }: { task_id: string; text: string }, { sb }) => {
      must(await sb.from("tasks").select("id").eq("id", task_id).maybeSingle(), "Task");
      const { html, mentions } = htmlFromText(text, await people(sb));
      const c = must(
        await sb.from("comments").insert({ task_id, body: html, mentions }).select("id,created_at").single(),
        "Could not post the comment"
      );
      return { comment_id: (c as unknown as { id: string }).id, mentioned: mentions.length };
    })
  );
}
