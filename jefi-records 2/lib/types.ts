export type Profile = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
};

export type Visibility = "public" | "private";

export type Project = {
  id: string;
  name: string;
  archived: boolean;
  position: number;
  visibility: Visibility;
  created_by: string;
};

export const PROJECT_COLUMNS = "id,name,archived,position,visibility,created_by";

export const PROFILE_COLUMNS = "id,name,email,avatar_url";

export type Section = {
  id: string;
  project_id: string;
  name: string;
  position: number;
};

export type Status = {
  id: string;
  project_id: string;
  name: string;
  color: string;
  position: number;
  is_done: boolean;
};

export type Task = {
  id: string;
  project_id: string;
  section_id: string | null;
  parent_task_id: string | null;
  name: string;
  status_id: string | null;
  assignee_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  position: number;
  created_at: string;
};

export const TASK_COLUMNS =
  "id,project_id,section_id,parent_task_id,name,status_id,assignee_id,due_at,completed_at,position,created_at";
