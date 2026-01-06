
import React from 'react';
import { Agent, AgentRole, AgentPrompts, ThemeMode, ThemeConfig } from './types';

export const THEME_CONFIGS: Record<ThemeMode, ThemeConfig> = {
  DARK: {
    appBg: 'bg-slate-950',
    sidebarBg: 'bg-slate-900/10',
    panelBg: 'bg-slate-900/40',
    cardBg: 'bg-slate-900',
    border: 'border-slate-800',
    textMain: 'text-slate-100',
    textSec: 'text-slate-300',
    textMuted: 'text-slate-500',
    accent: 'indigo',
    accentBg: 'bg-indigo-600',
    accentText: 'text-indigo-400',
    accentBorder: 'border-indigo-500',
    buttonSecondary: 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700',
    inputBg: 'bg-slate-950',
    isGlass: false
  },
  LIGHT: {
    appBg: 'bg-gray-50',
    sidebarBg: 'bg-white/50',
    panelBg: 'bg-white shadow-sm',
    cardBg: 'bg-white',
    border: 'border-gray-200',
    textMain: 'text-gray-900',
    textSec: 'text-gray-600',
    textMuted: 'text-gray-400',
    accent: 'blue',
    accentBg: 'bg-blue-600',
    accentText: 'text-blue-600',
    accentBorder: 'border-blue-500',
    buttonSecondary: 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100',
    inputBg: 'bg-white',
    isGlass: false
  },
  AUTUMN: {
    appBg: 'bg-stone-950',
    sidebarBg: 'bg-[#2c241b]/40',
    panelBg: 'bg-[#2c241b]/60',
    cardBg: 'bg-[#2c241b]',
    border: 'border-stone-800',
    textMain: 'text-orange-50',
    textSec: 'text-stone-300',
    textMuted: 'text-stone-500',
    accent: 'orange',
    accentBg: 'bg-orange-600',
    accentText: 'text-orange-400',
    accentBorder: 'border-orange-500',
    buttonSecondary: 'bg-stone-900 text-stone-300 border-stone-700 hover:bg-stone-800',
    inputBg: 'bg-stone-900',
    isGlass: false
  },
  GLASS: {
    appBg: 'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-950 via-slate-950 to-black',
    sidebarBg: 'bg-white/5 backdrop-blur-md',
    panelBg: 'bg-white/5 backdrop-blur-xl shadow-2xl',
    cardBg: 'bg-white/5 backdrop-blur-md',
    border: 'border-white/10',
    textMain: 'text-white',
    textSec: 'text-slate-200',
    textMuted: 'text-slate-400',
    accent: 'cyan',
    accentBg: 'bg-cyan-600/80 backdrop-blur-md',
    accentText: 'text-cyan-300',
    accentBorder: 'border-cyan-400/50',
    buttonSecondary: 'bg-white/10 text-white border-white/10 hover:bg-white/20 backdrop-blur-md',
    inputBg: 'bg-black/20 backdrop-blur-sm',
    isGlass: true
  }
};

export const DEFAULT_PROMPTS: AgentPrompts = {
  [AgentRole.RESEARCHER]: `Você é um Pesquisador Investigativo Sênior.
  
TÓPICO: "{{topic}}"
OBJETIVO: "{{objective}}"

Sua missão é buscar dados RECENTES, estatísticas, estudos e fatos concretos sobre este tópico na web.
Não escreva o artigo. Apenas compile um "Dossiê de Pesquisa" organizado, citando fontes, datas e números que darão autoridade ao texto do escritor.
Seja técnico e profundo.`,

  [AgentRole.WRITER]: `Você é um Escritor de Elite com a seguinte PERSONA: "{{persona}}". 
                 
CONTEXTO DO PROJETO:
- Tópico: "{{topic}}"
- Objetivo: "{{objective}}"
- Público-alvo: "{{audience}}"
- Visão de Mundo/Lugar de Fala: "{{worldview}}"

DOSSIÊ DE PESQUISA (Use estes dados como base factual):
{{research}}

INSTRUÇÃO: Escreva um artigo profundo e original. 
Use os dados do dossiê para fundamentar seus argumentos, mas escreva com a SUAS próprias palavras e estilo.
NÃO use clichês de IA. Use formatação Markdown elegante.`,

  [AgentRole.REVIEWER]: `ATENÇÃO: Você é um Editor Sênior extremamente crítico e exigente (nível New Yorker/Piauí). Sua tolerância para textos genéricos, rasos ou com "cheiro de IA" é ZERO.

PARÂMETROS DE AUDITORIA (SEJA IMPLACÁVEL):
1. **Detector de IA**: O texto usa clichês, estruturas repetitivas, "em conclusão", ou adjetivos vazios? Se sim, REPROVE.
2. **Uso de Dados**: O texto utilizou bem as informações factuais? Ele tem substância ou é apenas "enrolação"?
3. **Voz e Personalidade**: O texto é corajoso? Se eu trocar a assinatura, o texto serve para qualquer um? Se for genérico, REPROVE.
4. **Alinhamento Radical**: O texto segue estritamente a visão de mundo: "{{worldview}}"? Se for "isentão" ou neutro demais, REPROVE.

TEXTO PARA ANÁLISE:
\n\n{{content}}\n\n

Se houver *qualquer* falha, retorne 'CORRIGIR'. Seu feedback deve ser duro, direto e apontar exatamente onde o texto foi preguiçoso. Não elogie o esforço, exija excelência.`,

  [AgentRole.CORRECTOR]: `Você é um Refinador de Texto. Corrija o texto abaixo para que ele se encaixe perfeitamente na identidade do autor.
                 
IDENTIDADE DO AUTOR:
- Persona: "{{persona}}"
- Visão de Mundo: "{{worldview}}"
- Público: "{{audience}}"

TEXTO ORIGINAL: \n\n{{content}}\n\n
FEEDBACK DO REVISOR: "{{feedback}}"

INSTRUÇÃO: Reescreva o texto corrigindo os pontos citados, garantindo que a "voz" da persona brilhe no resultado final.`,

  [AgentRole.MANAGER]: `Você é o Diretor de Conteúdo. Seu critério final é: "Este texto tem a alma do nosso autor?"
                 
PERFIL DO PROJETO:
- Autor: "{{persona}}"
- Público: "{{audience}}"
- Posicionamento: "{{worldview}}"

TEXTO: \n\n{{content}}\n\n

Decida: 'OK' se o texto for autêntico e impactante para o público. 'CORRIGIR' se parecer um texto morno e sem personalidade.`,

  [AgentRole.DESIGNER]: `Você é um Designer Editorial e Ilustrador. Sua missão é criar uma imagem de capa que capture a essência do artigo.

TEXTO DO ARTIGO:
{{content}}

INSTRUÇÃO: Com base no texto acima, crie uma descrição visual detalhada (prompt) para uma ilustração editorial. 
A imagem deve ser elegante, artística e evitar elementos literais ou clichês de banco de imagem.
FOCO: Estilo conceitual, paleta de cores harmoniosa, composição impactante.
O prompt deve ser em inglês para melhor performance do modelo de imagem.`
};

export const AGENTS: Record<AgentRole, Agent> = {
  [AgentRole.RESEARCHER]: {
    id: AgentRole.RESEARCHER,
    name: 'Pesquisador de Dados',
    roleTitle: 'Investigador de Fontes',
    description: 'Busca fatos reais e recentes na web para embasar o texto.',
    color: 'bg-cyan-600',
  },
  [AgentRole.WRITER]: {
    id: AgentRole.WRITER,
    name: 'Escritor Criativo',
    roleTitle: 'Ghostwriter Especialista',
    description: 'Transforma dados em narrativas ricas e envolventes.',
    color: 'bg-blue-500',
  },
  [AgentRole.REVIEWER]: {
    id: AgentRole.REVIEWER,
    name: 'Analista de Qualidade',
    roleTitle: 'Editor Implacável',
    description: 'Tolerância zero para textos genéricos ou sem substância.',
    color: 'bg-amber-500',
  },
  [AgentRole.CORRECTOR]: {
    id: AgentRole.CORRECTOR,
    name: 'Refinador de Texto',
    roleTitle: 'Revisor de Precisão',
    description: 'Aplica correções baseadas nos feedbacks dos revisores.',
    color: 'bg-emerald-500',
  },
  [AgentRole.MANAGER]: {
    id: AgentRole.MANAGER,
    name: 'Diretor de Conteúdo',
    roleTitle: 'Aprovador Final',
    description: 'Dá a palavra final ou exige retrabalho total.',
    color: 'bg-purple-600',
  },
  [AgentRole.DESIGNER]: {
    id: AgentRole.DESIGNER,
    name: 'Designer Ilustrador',
    roleTitle: 'Artista Visual',
    description: 'Gera ilustrações de capa baseadas no conteúdo final.',
    color: 'bg-pink-500',
  },
};

export const ICONS = {
  Researcher: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 7v3m0 0v3m0-3h3m-3 0H7" />
    </svg>
  ),
  Writer: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
  Reviewer: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  Corrector: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  Manager: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Designer: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
};
