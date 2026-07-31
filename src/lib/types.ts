export type TaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  categoryId: string | null;
  tagIds: string[];
  dueDate: string | null; // ISO
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  createdAt: string;
}

export type NotificationType = "DUE_SOON" | "DUE_TODAY" | "OVERDUE";

export interface AppNotification {
  id: string;
  taskId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface ProjectMember {
  id: string;
  name: string;
  role: string;
}

export interface ProjectStage {
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  categoryId: string | null;
  tagIds: string[];
  dueDate: string | null;
  members: ProjectMember[];
  stages: ProjectStage[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface UserProfile {
  name: string;
  role: string;
  email: string;
  avatar: string | null;
  createdAt: string;
}

export type ThemeMode = "light" | "dark" | "system";

export interface AppSettings {
  theme: ThemeMode;
  notificationsEnabled: boolean;
  reminderDays: number;
  calendar: "jalali" | "gregorian";
}

export interface AppData {
  version: number;
  tasks: Task[];
  projects: Project[];
  categories: Category[];
  tags: Tag[];
  notifications: AppNotification[];
  profile: UserProfile | null;
  settings: AppSettings;
}


export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "انجام‌نشده",
  IN_PROGRESS: "در حال انجام",
  COMPLETED: "تکمیل‌شده",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "کم",
  MEDIUM: "متوسط",
  HIGH: "زیاد",
};

export const defaultSettings: AppSettings = {
  theme: "system",
  notificationsEnabled: true,
  reminderDays: 2,
  calendar: "jalali",
};

export const emptyData: AppData = {
  version: 1,
  tasks: [],
  projects: [],
  categories: [],
  tags: [],
  notifications: [],
  profile: null,
  settings: defaultSettings,
};

