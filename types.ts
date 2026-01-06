
export enum AgentRole {
  RESEARCHER = 'RESEARCHER',
  WRITER = 'WRITER',
  REVIEWER = 'REVIEWER',
  CORRECTOR = 'CORRECTOR',
  MANAGER = 'MANAGER',
  DESIGNER = 'DESIGNER'
}

export type TaskStatus = 'QUEUED' | 'PROCESSING' | 'READY_FOR_HUMAN' | 'COMPLETED' | 'FAILED';

export interface AgentPrompts {
  [AgentRole.RESEARCHER]: string;
  [AgentRole.WRITER]: string;
  [AgentRole.REVIEWER]: string;
  [AgentRole.CORRECTOR]: string;
  [AgentRole.MANAGER]: string;
  [AgentRole.DESIGNER]: string;
}

export interface Task {
  id: string;
  topic: string;
  steps: Step[];
  status: TaskStatus;
  finalContent?: string;
  imageUrl?: string;
  createdAt: Date;
}

export interface Agent {
  id: AgentRole;
  name: string;
  roleTitle: string;
  description: string;
  color: string;
}

export interface Step {
  id: string;
  agent: AgentRole | 'USER';
  content: string;
  feedback?: string;
  status: 'PENDING' | 'WORKING' | 'COMPLETED' | 'REJECTED';
  timestamp: Date;
  sources?: Array<{ title: string; uri: string }>;
}

export interface ReviewResponse {
  status: 'CORRIGIR' | 'APROVAR';
  feedback: string;
}

export interface FinalApprovalResponse {
  status: 'OK' | 'CORRIGIR';
  comentario: string;
}

export type ThemeMode = 'DARK' | 'LIGHT' | 'AUTUMN' | 'GLASS';

export interface ThemeConfig {
  appBg: string;
  sidebarBg: string;
  panelBg: string;
  cardBg: string;
  border: string;
  textMain: string;
  textSec: string;
  textMuted: string;
  accent: string; // color name for dynamic construction
  accentBg: string;
  accentText: string;
  accentBorder: string;
  buttonSecondary: string;
  inputBg: string;
  isGlass?: boolean;
}
