
import React from 'react';
import { Agent, AgentRole, ThemeConfig } from '../types';
import { ICONS } from '../constants';

interface AgentCardProps {
  agent: Agent;
  isWorking: boolean;
  isDone: boolean;
  isRejected: boolean;
  theme: ThemeConfig;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, isWorking, isDone, isRejected, theme }) => {
  const Icon = (ICONS as any)[agent.id.charAt(0) + agent.id.slice(1).toLowerCase()] || ICONS.Writer;

  // For light mode, we might want to ensure agent colors aren't too bright on white,
  // but standard tailwind colors usually work. We will use the theme's border and backgrounds.

  let cardStatusClass = '';
  
  if (isWorking) {
    cardStatusClass = `${theme.accentBorder} ${theme.accentBg.replace('bg-', 'bg-').replace('600', '500')}/10 scale-105 shadow-lg`;
  } else if (isDone) {
    cardStatusClass = `border-emerald-500/50 bg-emerald-500/5`;
  } else if (isRejected) {
    cardStatusClass = `border-red-500/50 bg-red-500/5`;
  } else {
    // Inactive state
    cardStatusClass = `${theme.border} ${theme.cardBg} ${theme.isGlass ? '' : 'opacity-60'} grayscale`;
  }

  return (
    <div className={`relative p-4 rounded-xl border transition-all duration-300 ${cardStatusClass}`}>
      {isWorking && (
        <div className="absolute -top-2 -right-2 flex h-5 w-5">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${theme.accentBg.replace('bg-', 'bg-').replace('600', '400')} opacity-75`}></span>
          <span className={`relative inline-flex rounded-full h-5 w-5 ${theme.accentBg.replace('bg-', 'bg-').replace('600', '500')}`}></span>
        </div>
      )}
      
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${agent.color} text-white shadow-sm`}>
          <Icon />
        </div>
        <div>
          <h3 className={`text-sm font-bold ${theme.textMain}`}>{agent.name}</h3>
          <p className={`text-xs ${theme.textMuted}`}>{agent.roleTitle}</p>
        </div>
      </div>
      
      <div className="mt-4 flex items-center justify-between">
        <span className={`text-[10px] font-mono uppercase tracking-wider ${theme.textMuted}`}>
          Status:
        </span>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${
          isWorking ? theme.accentText :
          isDone ? 'text-emerald-500' :
          isRejected ? 'text-red-500' :
          theme.textSec
        }`}>
          {isWorking ? 'Em Processo...' : isDone ? 'Aprovado' : isRejected ? 'Revisão Necessária' : 'Aguardando'}
        </span>
      </div>
    </div>
  );
};

export default AgentCard;
