import type { Recurrence } from "./recurrence";

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
  image_url?: string | null;
  emoji?: string | null;
  /* Only loaded on the project page. */
  appearance?: unknown;
  appearance_shared?: boolean;
  default_section_name?: string;
};

export const PROJECT_COLUMNS =
  "id,name,archived,position,visibility,created_by,image_url,emoji";

export const PROJECT_PAGE_COLUMNS = `${PROJECT_COLUMNS},appearance,appearance_shared,default_section_name`;

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
  due_has_time: boolean;
  recurrence: Recurrence | null;
  completed_at: string | null;
  position: number;
  created_at: string;
};

export const TASK_COLUMNS =
  "id,project_id,section_id,parent_task_id,name,status_id,assignee_id,due_at,due_has_time,recurrence,completed_at,position,created_at";

export type FieldType =
  | "dropdown"
  | "multi_select"
  | "text"
  | "number"
  | "url"
  | "checkbox"
  | "person";

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  dropdown: "Dropdown",
  multi_select: "Multi-select",
  text: "Text",
  number: "Number",
  url: "Link",
  checkbox: "Checkbox",
  person: "Person",
};

export type FieldOption = { id: string; name: string; color: string };

export type FieldDef = {
  id: string;
  project_id: string;
  name: string;
  type: FieldType;
  options: FieldOption[];
  position: number;
  visible: boolean;
  width: number | null;
};

export const FIELD_COLUMNS = "id,project_id,name,type,options,position,visible,width";

export type Tag = { id: string; name: string; color: string };

export type FieldValues = Record<string, unknown>;
