/* Builds the text that "Ask Claude" on Home sends to claude.ai. Claude reads
   Jefi Records through the Jefi Records connector, as you, so it only sees
   what you can see. Changes are proposed first and wait for a yes. */

export type PromptKind =
  | "focus"
  | "weekly"
  | "status"
  | "plan"
  | "problems"
  | "workload"
  | "forgot"
  | "tidy"
  | "custom";

export type QuickPrompt = { kind: PromptKind; label: string };

export const QUICK_PROMPTS: QuickPrompt[] = [
  { kind: "focus", label: "What should I focus on today?" },
  { kind: "weekly", label: "Weekly review" },
  { kind: "status", label: "Project status summary" },
  { kind: "plan", label: "Plan a project or break down a task" },
  { kind: "problems", label: "Find problems" },
  { kind: "workload", label: "What is each of us working on?" },
  { kind: "forgot", label: "What did I forget?" },
  { kind: "tidy", label: "Tidy up suggestions" },
];

export type PromptInput = {
  kind: PromptKind;
  /** The project name for a status summary, or the goal for a plan, or the free question. */
  text?: string;
  otherName: string;
  now?: Date;
};

function today(now: Date): string {
  const day = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  let zone = "";
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* the time zone is a nice extra */
  }
  return zone ? `${day} (time zone ${zone})` : day;
}

export function buildClaudePrompt({ kind, text, otherName, now = new Date() }: PromptInput): string {
  const other = otherName || "my partner";
  const intro = [
    `I use Jefi Records, the shared task app I run with ${other}. Use the Jefi Records connector to look at my projects, tasks, subtasks, comments, tags and notifications. You see what I see and nothing else.`,
    `Today is ${today(now)}.`,
    "Read only for now. Do not create, edit, complete or delete anything yet. If something should change, list the proposed changes as a numbered list (what, which project, new value) and wait for my yes. After I say yes, make only the changes I approved.",
  ].join("\n\n");

  const body: Record<PromptKind, string> = {
    focus:
      "What should I focus on today? Look at my open tasks that are overdue, due today or due soon, and at my unread notifications and recent comments. Give me a short ordered list with one sentence on why each item is there, and flag anything at risk.",
    weekly:
      "Do my weekly review. Cover what I finished in the last 7 days, what slipped or is overdue, what is coming up in the next 7 days, and what I should carry into next week.",
    status: `Give me a status summary for the project "${text?.trim() || "(pick the project I mean)"}". Cover overall progress, what finished recently, what is blocked or overdue, who owns what, and what is due next.`,
    plan: `Help me plan this: ${text?.trim() || "(I will describe it next)"}\n\nPropose a section structure and a task list with subtasks, suggested assignees and due dates. Ask me anything you need to know first. Do not create anything until I say yes.`,
    problems:
      "Review all of my projects for problems: overdue tasks, tasks with no updates for 14 days or more, tasks with no assignee or no due date, likely duplicates and empty sections. Group them by project and tell me the five fixes worth doing first.",
    workload: `What is each of us working on? Compare what is open and due for me and for ${other}: counts, what is due this week, who looks overloaded, and which tasks could move to balance the load.`,
    forgot:
      "What did I forget? Look across my tasks, comments, mentions and notifications for loose ends: unanswered questions, things I said I would do, tasks assigned to me that I have not touched, and anything with a date that is close.",
    tidy:
      "Suggest ways to tidy up Jefi Records: tasks to complete or archive, projects to rename or merge, sections to reorganize and tags to clean up. Propose only, and wait for my yes.",
    custom: text?.trim() ? `My question: ${text.trim()}` : "What would you like to know about Jefi Records?",
  };

  return `${intro}\n\n${body[kind]}`;
}

const MAX_URL = 7000;

/* Address that opens a new Claude chat with the prompt typed in. Returns null
   when the prompt is too long for a link. */
export function claudeUrl(prompt: string): string | null {
  const url = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
  return url.length <= MAX_URL ? url : null;
}
