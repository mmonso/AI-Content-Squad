
export enum AgentRole {
  RESEARCHER = 'RESEARCHER',
  WRITER = 'WRITER',
  REVIEWER = 'REVIEWER',
  CORRECTOR = 'CORRECTOR',
  MANAGER = 'MANAGER',
  DESIGNER = 'DESIGNER'
}

export type TaskStatus = 'QUEUED' | 'PROCESSING' | 'READY_FOR_HUMAN' | 'COMPLETED' | 'FAILED';

export interface Task {
  id: string;
  topic: string;
  status: TaskStatus;
  finalContent?: string;
  imageUrl?: string;
  createdAt: Date;
  steps: Step[];
}

export interface Step {
  id: string;
  agent: AgentRole | 'USER';
  content: string;
  feedback?: string;
  status: 'PENDING' | 'WORKING' | 'COMPLETED' | 'REJECTED';
  timestamp: Date;
  sources?: any[];
}

export interface AgentPrompts {
  [key: string]: string;
}

// Added 'AUTUMN' to the ThemeMode union
export type ThemeMode = 'DARK' | 'LIGHT' | 'AUTUMN' | 'GLASS';

// Added missing ThemeConfig interface
export interface ThemeConfig {
  appBg: string;
  sidebarBg: string;
  panelBg: string;
  cardBg: string;
  border: string;
  textMain: string;
  textSec: string;
  textMuted: string;
  accent: string;
  accentBg: string;
  accentText: string;
  accentBorder: string;
  buttonSecondary: string;
  inputBg: string;
  isGlass: boolean;
}

// Added missing Agent interface
export interface Agent {
  id: AgentRole;
  name: string;
  roleTitle: string;
  description: string;
  color: string;
}

export interface ProjectConfig {
  objective: string;
  persona: string;
  audience: string;
  worldview: string;
}
