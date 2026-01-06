
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AgentRole, Step, Task, TaskStatus, AgentPrompts, ThemeMode } from './types';
import { AGENTS as AGENT_DATA, ICONS, DEFAULT_PROMPTS, THEME_CONFIGS } from './constants';
import AgentCard from './components/AgentCard';
import { geminiService, ProjectContext } from './services/gemini';
import ReactMarkdown from 'react-markdown';

const STORAGE_KEYS = {
  TASKS: 'editorial_factory_tasks_v1',
  PROJECT: 'editorial_factory_project_v1',
  PROMPTS: 'editorial_factory_prompts_v1',
  THEME: 'editorial_factory_theme_v1',
};

const App: React.FC = () => {
  // Configurações do Projeto
  const [objective, setObjective] = useState('Gerar repertório e visão crítica nos leitores do blog');
  const [persona, setPersona] = useState('Psicólogo Clínico');
  const [audience, setAudience] = useState('Leigos Interessados em saúde mental, ensino superior');
  const [worldview, setWorldview] = useState('Psicologia crítica, histórico-social, psicanálise social. Local de publicação: Blog de psicologia');
  
  // Theme State
  const [themeMode, setThemeMode] = useState<ThemeMode>('DARK');

  // UI State
  const [leftTab, setLeftTab] = useState<'queue' | 'archive'>('queue');
  const [isPromptEditorOpen, setIsPromptEditorOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  
  // Active Section States for Modals
  const [activeProjectSection, setActiveProjectSection] = useState<number>(0);
  const [activePromptRole, setActivePromptRole] = useState<AgentRole>(AgentRole.RESEARCHER);

  const [agentPrompts, setAgentPrompts] = useState<AgentPrompts>(DEFAULT_PROMPTS);
  const [bulkTopics, setBulkTopics] = useState('');
  const [userFeedback, setUserFeedback] = useState('');

  // Factory State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isFactoryRunning, setIsFactoryRunning] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<AgentRole | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);
  const factoryAbortRef = useRef(false);

  // Persistence: Load initial state
  useEffect(() => {
    const savedProject = localStorage.getItem(STORAGE_KEYS.PROJECT);
    if (savedProject) {
      try {
        const { objective, persona, audience, worldview } = JSON.parse(savedProject);
        setObjective(objective);
        setPersona(persona);
        setAudience(audience);
        setWorldview(worldview);
      } catch (e) { console.error("Error loading project state", e); }
    }

    const savedPrompts = localStorage.getItem(STORAGE_KEYS.PROMPTS);
    if (savedPrompts) {
      try { 
        const parsed = JSON.parse(savedPrompts);
        setAgentPrompts({ ...DEFAULT_PROMPTS, ...parsed }); 
      } 
      catch (e) { console.error("Error loading prompts state", e); }
    }

    const savedTasks = localStorage.getItem(STORAGE_KEYS.TASKS);
    if (savedTasks) {
      try {
        const parsedTasks = JSON.parse(savedTasks).map((t: any) => ({
          ...t,
          createdAt: new Date(t.createdAt),
          steps: t.steps.map((s: any) => ({ ...s, timestamp: new Date(s.timestamp) }))
        }));
        setTasks(parsedTasks);
      } catch (e) { console.error("Error loading tasks state", e); }
    }

    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (savedTheme && THEME_CONFIGS[savedTheme as ThemeMode]) {
      setThemeMode(savedTheme as ThemeMode);
    }
  }, []);

  // Persistence: Save state on changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PROJECT, JSON.stringify({ objective, persona, audience, worldview }));
  }, [objective, persona, audience, worldview]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PROMPTS, JSON.stringify(agentPrompts));
  }, [agentPrompts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.THEME, themeMode);
  }, [themeMode]);

  const activeTask = tasks.find(t => t.id === activeTaskId);
  const t = THEME_CONFIGS[themeMode]; // Short alias for current theme config

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeTask?.steps]);

  const updateTaskStatus = useCallback((taskId: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
  }, []);

  const addStepToTask = useCallback((taskId: string, agent: AgentRole | 'USER', content: string, status: Step['status'], feedback?: string, sources?: Step['sources']) => {
    const newStep: Step = {
      id: Math.random().toString(36).substr(2, 9),
      agent,
      content,
      status,
      feedback,
      timestamp: new Date(),
      sources
    };
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, steps: [...t.steps, newStep] } : t));
  }, []);

  const runAiCycle = async (taskId: string): Promise<boolean> => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return false;

    const context: ProjectContext = {
      topic: task.topic,
      objective,
      persona,
      audience,
      worldview: worldview || "Profissional"
    };

    updateTaskStatus(taskId, { status: 'PROCESSING' });

    try {
      let currentContent = task.finalContent || '';
      let researchContent = '';
      
      const hasResearch = task.steps.some(s => s.agent === AgentRole.RESEARCHER);
      if (!hasResearch && !task.finalContent) {
        setCurrentAgent(AgentRole.RESEARCHER);
        const researchResult = await geminiService.researchTopic(context, agentPrompts[AgentRole.RESEARCHER]);
        researchContent = researchResult.content;
        addStepToTask(taskId, AgentRole.RESEARCHER, researchResult.content, 'COMPLETED', undefined, researchResult.sources);
      } else {
        const researchStep = task.steps.find(s => s.agent === AgentRole.RESEARCHER);
        researchContent = researchStep?.content || '';
      }

      if (task.steps.filter(s => s.agent === AgentRole.WRITER || s.agent === AgentRole.CORRECTOR).length === 0) {
        setCurrentAgent(AgentRole.WRITER);
        currentContent = await geminiService.writeContent(context, researchContent, agentPrompts[AgentRole.WRITER]);
        addStepToTask(taskId, AgentRole.WRITER, currentContent, 'COMPLETED');
      }

      let workflowFinished = false;
      let attempts = 0;
      const MAX_AI_ATTEMPTS = 5;

      while (!workflowFinished && attempts < MAX_AI_ATTEMPTS) {
        attempts++;

        setCurrentAgent(AgentRole.REVIEWER);
        const review = await geminiService.reviewContent(currentContent, context, agentPrompts[AgentRole.REVIEWER]);
        
        if (review.status === 'CORRIGIR') {
          addStepToTask(taskId, AgentRole.REVIEWER, '⚠️ Reprovado na Revisão Técnica', 'REJECTED', review.feedback);
          
          setCurrentAgent(AgentRole.CORRECTOR);
          currentContent = await geminiService.correctContent(currentContent, review.feedback, context, agentPrompts[AgentRole.CORRECTOR]);
          addStepToTask(taskId, AgentRole.CORRECTOR, currentContent, 'COMPLETED');
          continue;
        } else {
          addStepToTask(taskId, AgentRole.REVIEWER, review.feedback, 'COMPLETED');
        }

        setCurrentAgent(AgentRole.MANAGER);
        const managerCheck = await geminiService.manageApproval(currentContent, context, agentPrompts[AgentRole.MANAGER]);
        
        if (managerCheck.status === 'CORRIGIR') {
          addStepToTask(taskId, AgentRole.MANAGER, '🚫 Veto da Direção de Conteúdo', 'REJECTED', managerCheck.comentario);
          setCurrentAgent(AgentRole.CORRECTOR);
          currentContent = await geminiService.correctContent(currentContent, managerCheck.comentario, context, agentPrompts[AgentRole.CORRECTOR]);
          addStepToTask(taskId, AgentRole.CORRECTOR, currentContent, 'COMPLETED');
        } else {
          addStepToTask(taskId, AgentRole.MANAGER, managerCheck.comentario, 'COMPLETED');
          
          setCurrentAgent(AgentRole.DESIGNER);
          try {
            const imageUrl = await geminiService.generateImage(currentContent, agentPrompts[AgentRole.DESIGNER]);
            addStepToTask(taskId, AgentRole.DESIGNER, "🎨 Ilustração Editorial Gerada.", 'COMPLETED');
            updateTaskStatus(taskId, { imageUrl });
          } catch (err) {
            console.error("Image generation failed", err);
            addStepToTask(taskId, AgentRole.DESIGNER, "❌ Falha ao gerar ilustração.", 'COMPLETED');
          }

          updateTaskStatus(taskId, { status: 'READY_FOR_HUMAN', finalContent: currentContent });
          workflowFinished = true;
          return true;
        }
      }
      return false;
    } catch (e) {
      console.error(e);
      updateTaskStatus(taskId, { status: 'FAILED' });
      return false;
    } finally {
      setCurrentAgent(null);
    }
  };

  const startFactory = async () => {
    if (isFactoryRunning) {
      factoryAbortRef.current = true;
      setIsFactoryRunning(false);
      return;
    }
    setIsFactoryRunning(true);
    factoryAbortRef.current = false;
    let queuedTasks = tasks.filter(t => t.status === 'QUEUED' || t.status === 'FAILED');
    for (const task of queuedTasks) {
      if (factoryAbortRef.current) break;
      setActiveTaskId(task.id);
      await runAiCycle(task.id);
    }
    setIsFactoryRunning(false);
  };

  const addToQueue = () => {
    const lines = bulkTopics.split('\n').filter(line => line.trim() !== '');
    const newTasks: Task[] = lines.map(topic => ({
      id: Math.random().toString(36).substr(2, 9),
      topic: topic.trim(),
      steps: [],
      status: 'QUEUED',
      createdAt: new Date()
    }));
    setTasks(prev => [...prev, ...newTasks]);
    setBulkTopics('');
    if (!activeTaskId) setActiveTaskId(newTasks[0].id);
    setLeftTab('queue');
  };

  const clearArchive = () => {
    if (window.confirm('Deseja realmente limpar todos os itens arquivados e falhas?')) {
      setTasks(prev => prev.filter(t => t.status !== 'COMPLETED' && t.status !== 'FAILED'));
    }
  };

  const handleUserApproval = (taskId: string) => {
    updateTaskStatus(taskId, { status: 'COMPLETED' });
    addStepToTask(taskId, 'USER', '✅ Aprovado pelo Editor Humano.', 'COMPLETED');
  };

  const handleUserRequestChanges = async (taskId: string) => {
    if (!userFeedback.trim()) return;
    const feedback = userFeedback;
    setUserFeedback('');
    addStepToTask(taskId, 'USER', `📝 Solicitação: ${feedback}`, 'COMPLETED');
    updateTaskStatus(taskId, { status: 'PROCESSING' });
    try {
      setCurrentAgent(AgentRole.CORRECTOR);
      const task = tasks.find(t => t.id === taskId);
      const corrected = await geminiService.correctContent(task?.finalContent || '', feedback, { topic: task?.topic || '', objective, persona, audience, worldview }, agentPrompts[AgentRole.CORRECTOR]);
      addStepToTask(taskId, AgentRole.CORRECTOR, corrected, 'COMPLETED');
      updateTaskStatus(taskId, { finalContent: corrected });
      await runAiCycle(taskId);
    } catch (e) { updateTaskStatus(taskId, { status: 'FAILED' }); }
    finally { setCurrentAgent(null); }
  };

  const exportToJson = (task: Task) => {
    if (!task.finalContent) return;
    
    const exportData = {
      id: task.id,
      topic: task.topic,
      metadata: {
        persona,
        audience,
        worldview,
        objective,
      },
      content: task.finalContent,
      imageUrl: task.imageUrl,
      createdAt: task.createdAt.toISOString(),
      exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `editorial_${task.id}_${task.topic.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportTask = (task: Task) => {
    if (!task.finalContent) return;

    const marked = (window as any).marked;
    if (!marked) {
      alert('Biblioteca de formatação ainda carregando. Tente novamente em alguns segundos.');
      return;
    }

    const htmlContent = marked.parse(task.finalContent);
    const imageHtml = task.imageUrl ? `<img src="${task.imageUrl}" style="width: 100%; border-radius: 12px; margin-bottom: 40px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">` : '';

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${task.topic} - AI Content Squad</title>
            <style>
              @page { margin: 2cm; }
              body { 
                font-family: 'Georgia', 'Times New Roman', serif; 
                line-height: 1.8; 
                color: #1a202c; 
                max-width: 800px; 
                margin: 0 auto; 
                padding: 40px; 
              }
              h1 { 
                font-family: 'Arial', sans-serif;
                font-size: 26pt; 
                font-weight: 700;
                border-bottom: 3px solid #2b6cb0; 
                padding-bottom: 15px; 
                margin-bottom: 30px; 
                color: #1a365d; 
                line-height: 1.2;
              }
              .content { font-size: 12pt; text-align: justify; }
              .meta-box { 
                font-family: 'Arial', sans-serif; 
                font-size: 10pt; 
                color: #4a5568; 
                margin-bottom: 50px; 
                padding: 20px; 
                background: #f7fafc; 
                border: 1px solid #e2e8f0;
                border-radius: 8px; 
              }
            </style>
          </head>
          <body>
            <h1>${task.topic}</h1>
            <div class="meta-box">
              <strong>Autor:</strong> ${persona} | <strong>Público:</strong> ${audience}
            </div>
            ${imageHtml}
            <div class="content">
              ${htmlContent}
            </div>
            <script>window.onload = () => setTimeout(() => window.print(), 500);</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const productionTasks = tasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'FAILED');
  const archiveTasks = tasks.filter(t => t.status === 'COMPLETED' || t.status === 'FAILED');

  const projectSections = [
    { label: 'Persona do Autor', desc: 'O perfil psicológico e profissional do ghostwriter.', val: persona, set: setPersona, type: 'textarea' },
    { label: 'Público-alvo', desc: 'Para quem este conteúdo está sendo produzido?', val: audience, set: setAudience, type: 'textarea' },
    { label: 'Visão de Mundo', desc: 'Viés teórico, ideológico ou local de fala do autor.', val: worldview, set: setWorldview, type: 'textarea' },
    { label: 'Objetivo Principal', desc: 'A finalidade prática do conteúdo gerado.', val: objective, set: setObjective, type: 'textarea' },
  ];

  const activeProject = projectSections[activeProjectSection];

  return (
    <div className={`flex flex-col h-full overflow-hidden font-sans transition-colors duration-500 ${t.appBg} ${t.textMain}`}>
      <header className={`h-16 border-b ${t.border} ${t.panelBg} backdrop-blur-md flex items-center px-6 shrink-0 justify-between z-10 transition-colors duration-300`}>
        <div className="flex items-center gap-3">
          <div className={`${t.accentBg} p-1.5 rounded-lg shadow-lg`}>
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" /></svg>
          </div>
          <div>
            <h1 className={`font-bold text-xs uppercase tracking-widest ${t.textMain}`}>AI Content Squad</h1>
            <p className={`text-[9px] font-bold uppercase tracking-tighter ${t.accentText}`}>Multi-Agent Intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center p-1 rounded-lg border ${t.border} ${t.sidebarBg} mr-2`}>
             {(['DARK', 'LIGHT', 'AUTUMN', 'GLASS'] as ThemeMode[]).map(mode => (
               <button 
                 key={mode} 
                 onClick={() => setThemeMode(mode)}
                 className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${themeMode === mode ? t.accentBg + ' text-white shadow-md' : 'text-slate-400 hover:text-slate-500'}`}
                 title={mode}
               >
                 {mode === 'DARK' && <span className="w-3 h-3 bg-slate-900 rounded-full border border-slate-600"></span>}
                 {mode === 'LIGHT' && <span className="w-3 h-3 bg-white rounded-full border border-gray-300"></span>}
                 {mode === 'AUTUMN' && <span className="w-3 h-3 bg-[#2c241b] rounded-full border border-orange-900"></span>}
                 {mode === 'GLASS' && <span className="w-3 h-3 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full"></span>}
               </button>
             ))}
          </div>

          <button onClick={() => setIsProjectModalOpen(true)} className={`flex items-center gap-2 p-2 rounded-lg transition-all ${t.textMuted} hover:${t.textMain} hover:${t.sidebarBg}`} title="Configurar Persona e Projeto">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            <span className="text-[10px] font-bold uppercase hidden sm:inline">Persona</span>
          </button>
          <button onClick={() => setIsPromptEditorOpen(true)} className={`p-2 rounded-lg transition-all ${t.textMuted} hover:${t.textMain} hover:${t.sidebarBg}`} title="Ajustar Prompts da Squad">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <div className={`h-8 w-px ${t.border} mx-2`}></div>
          <button onClick={startFactory} className={`px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${isFactoryRunning ? 'bg-red-500/20 text-red-400 border border-red-500' : `${t.accentBg} text-white shadow-lg`}`}>
            {isFactoryRunning ? 'Parar Produção' : 'Iniciar Fila'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className={`w-80 border-r ${t.border} ${t.sidebarBg} flex flex-col shrink-0 min-h-0 transition-colors duration-300`}>
          <div className={`flex border-b ${t.border} shrink-0`}>
            <button onClick={() => setLeftTab('queue')} className={`flex-1 py-4 text-[9px] font-bold uppercase tracking-widest transition-all ${leftTab === 'queue' ? `${t.accentText} border-b-2 ${t.accentBorder} ${t.isGlass ? 'bg-white/5' : 'bg-black/5'}` : `${t.textMuted} hover:${t.textSec}`}`}>Produção ({productionTasks.length})</button>
            <button onClick={() => setLeftTab('archive')} className={`flex-1 py-4 text-[9px] font-bold uppercase tracking-widest transition-all ${leftTab === 'archive' ? 'text-emerald-500 border-b-2 border-emerald-500 bg-emerald-500/5' : `${t.textMuted} hover:${t.textSec}`}`}>Arquivo ({archiveTasks.length})</button>
          </div>

          {leftTab === 'queue' ? (
            <div className="flex flex-col flex-1 min-h-0">
              <div className={`p-4 border-b ${t.border} shrink-0`}>
                <textarea value={bulkTopics} onChange={(e) => setBulkTopics(e.target.value)} placeholder="Novos tópicos (um por linha)..." className={`w-full ${t.inputBg} border ${t.border} rounded-lg p-3 text-xs ${t.textSec} h-24 resize-none focus:ring-1 focus:ring-${t.accent}-500 outline-none`} />
                <button onClick={addToQueue} className={`w-full mt-2 py-2.5 ${t.buttonSecondary} text-[9px] font-bold uppercase rounded-lg border transition-all tracking-widest`}>Adicionar à Fila</button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                {productionTasks.map(task => (
                  <button key={task.id} onClick={() => setActiveTaskId(task.id)} className={`w-full text-left p-4 rounded-xl border transition-all ${activeTaskId === task.id ? `${t.accentBorder} ${t.isGlass ? 'bg-white/10' : `${t.accentBg.replace('bg-', 'bg-').replace('600', '500')}/10`} shadow-lg` : `${t.border} ${t.cardBg} hover:opacity-80`}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[7px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter ${task.status === 'PROCESSING' ? `${t.accentBg} text-white animate-pulse` : `${t.inputBg} ${t.textMuted}`}`}>{task.status}</span>
                    </div>
                    <p className={`text-[11px] font-medium ${t.textMain} leading-snug`}>{task.topic}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                {archiveTasks.map(task => (
                  <button key={task.id} onClick={() => setActiveTaskId(task.id)} className={`w-full text-left p-4 rounded-xl border transition-all ${activeTaskId === task.id ? 'border-emerald-500 bg-emerald-500/10' : `${t.border} ${t.cardBg} hover:opacity-80`}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[7px] font-bold px-2 py-0.5 rounded-full uppercase ${task.status === 'COMPLETED' ? 'bg-emerald-900/30 text-emerald-500 border border-emerald-500/20' : 'bg-red-900/30 text-red-500 border border-red-500/20'}`}>{task.status === 'COMPLETED' ? 'Concluído' : 'Falha'}</span>
                    </div>
                    <p className={`text-[11px] font-medium ${t.textMuted} leading-snug`}>{task.topic}</p>
                  </button>
                ))}
              </div>
              {archiveTasks.length > 0 && (
                <div className={`p-4 border-t ${t.border} shrink-0`}>
                  <button onClick={clearArchive} className={`w-full py-2 ${t.cardBg} hover:bg-red-900/20 ${t.textMuted} hover:text-red-400 text-[9px] font-bold uppercase rounded-lg border ${t.border} transition-all tracking-widest`}>Limpar Arquivo</button>
                </div>
              )}
            </div>
          )}
        </aside>

        <main className={`flex-1 ${t.appBg} flex flex-col min-h-0 overflow-hidden relative transition-colors duration-500`}>
          {activeTask ? (
            <>
              <div className={`h-12 border-b ${t.border} flex items-center px-6 justify-between ${t.panelBg} shrink-0 transition-colors duration-300`}>
                <h3 className={`text-xs font-bold ${t.textMain} truncate pr-4`}>{activeTask.topic}</h3>
                <div className="flex gap-2 shrink-0">
                  {activeTask.status === 'READY_FOR_HUMAN' && <button onClick={() => handleUserApproval(activeTask.id)} className="px-4 py-1.5 bg-emerald-600 text-white text-[10px] font-bold uppercase rounded-lg hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 transition-all">Aprovar e Arquivar</button>}
                  {(activeTask.status === 'COMPLETED' || activeTask.status === 'READY_FOR_HUMAN') && (
                    <div className="flex gap-2">
                      <button onClick={() => exportToJson(activeTask)} className={`px-4 py-1.5 ${t.buttonSecondary} text-[10px] font-bold uppercase rounded-lg border ${t.border} flex items-center gap-2 transition-all`}>JSON</button>
                      <button onClick={() => exportTask(activeTask)} className={`px-4 py-1.5 ${t.accentBg} text-white text-[10px] font-bold uppercase rounded-lg shadow-lg flex items-center gap-2 transition-all`}>PDF</button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar min-h-0">
                <div className="max-w-3xl mx-auto pb-32">
                  <div className={`space-y-6 mb-16 border-b ${t.border} pb-16`}>
                    <div className="text-center mb-10 opacity-40"><span className={`text-[9px] font-bold uppercase tracking-[0.4em] ${t.textMuted}`}>Fluxo da Redação</span></div>
                    {activeTask.steps.map(step => (
                      <div key={step.id} className="flex gap-5 group animate-in slide-in-from-left-4 duration-500">
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`p-2.5 rounded-xl ${AGENT_DATA[step.agent as AgentRole]?.color || 'bg-slate-700'} text-white shadow-lg`}>
                            {step.agent === 'USER' ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0z" strokeWidth={2}/></svg> : (ICONS as any)[step.agent.charAt(0) + step.agent.slice(1).toLowerCase()]?.()}
                          </div>
                          <div className={`flex-1 w-px ${t.border} my-2 opacity-50`}></div>
                        </div>
                        <div className="flex-1 pb-6">
                          <div className="flex items-center gap-3 mb-2">
                             <span className={`text-xs font-bold ${t.textMain}`}>{AGENT_DATA[step.agent as AgentRole]?.name || 'Editor Humano'}</span>
                             <span className={`text-[8px] ${t.textMuted} font-mono tracking-tighter`}>{step.timestamp.toLocaleTimeString()}</span>
                          </div>
                          <div className={`p-5 rounded-2xl text-sm leading-relaxed ${step.status === 'REJECTED' ? 'bg-red-500/5 border border-red-500/20 text-red-500' : `${t.cardBg} border ${t.border} ${t.textSec}`}`}>
                            <ReactMarkdown>{step.content}</ReactMarkdown>
                            {step.sources && step.sources.length > 0 && (
                              <div className={`mt-4 pt-4 border-t ${t.border}`}>
                                <span className={`text-[9px] uppercase font-bold ${t.accentText} tracking-wider mb-2 block`}>Fontes Consultadas:</span>
                                <div className="space-y-1">
                                  {step.sources.map((source, idx) => (
                                    <a key={idx} href={source.uri} target="_blank" rel="noopener noreferrer" className={`block text-xs ${t.textMuted} hover:${t.accentText} truncate transition-colors`}>
                                      🔗 {source.title}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                            {step.feedback && <div className="mt-4 pt-4 border-t border-red-500/20 text-red-400 italic text-xs leading-relaxed"><ReactMarkdown>{step.feedback}</ReactMarkdown></div>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {(activeTask.status === 'READY_FOR_HUMAN' || activeTask.status === 'COMPLETED') && (
                    <div className="space-y-10 animate-in fade-in zoom-in-95 duration-700">
                      <div className={`${t.panelBg} border ${t.border} p-12 rounded-[2.5rem] shadow-2xl relative overflow-hidden group`}>
                        {activeTask.imageUrl && (
                          <div className="mb-10 -mt-2 -mx-2">
                            <img src={activeTask.imageUrl} alt="Capa do Artigo" className={`w-full rounded-3xl shadow-2xl border ${t.border}`} />
                          </div>
                        )}
                        <article className={`prose-custom max-w-none ${themeMode === 'LIGHT' ? 'text-gray-800' : 'text-slate-300'}`} style={{ color: themeMode === 'LIGHT' ? '#1f2937' : undefined }}>
                           <ReactMarkdown>{activeTask.finalContent || ''}</ReactMarkdown>
                        </article>
                      </div>
                      {activeTask.status === 'READY_FOR_HUMAN' && (
                        <div className={`${t.panelBg} border ${t.border} p-8 rounded-3xl shadow-2xl`}>
                          <h4 className={`text-[10px] font-bold ${t.textMuted} uppercase tracking-[0.2em] mb-4`}>Feedback Humano</h4>
                          <textarea value={userFeedback} onChange={(e) => setUserFeedback(e.target.value)} placeholder="O que precisa ser melhorado neste artigo?" className={`w-full ${t.inputBg} border ${t.border} rounded-2xl p-5 text-sm ${t.textMain} h-32 focus:ring-1 focus:ring-${t.accent}-500 outline-none resize-none mb-4 transition-all`} />
                          <button onClick={() => handleUserRequestChanges(activeTask.id)} className={`w-full py-4 ${t.buttonSecondary} text-[10px] font-bold uppercase rounded-2xl tracking-[0.3em] transition-all border ${t.border}`}>Devolver para Equipe</button>
                        </div>
                      )}
                    </div>
                  )}
                  <div ref={logEndRef} />
                </div>
              </div>

              {currentAgent && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
                   <div className={`px-8 py-4 ${t.accentBg} text-white text-[11px] font-bold rounded-full shadow-2xl flex items-center gap-4 border ${t.accentBorder} animate-pulse`}>
                      <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
                      <span className="tracking-widest uppercase">{AGENT_DATA[currentAgent].name} Atuando...</span>
                   </div>
                </div>
              )}
            </>
          ) : (
            <div className={`flex-1 flex flex-col items-center justify-center opacity-5 select-none pointer-events-none ${t.textMain}`}>
              <svg className="w-48 h-48 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" strokeWidth={1}/></svg>
              <span className="text-2xl font-bold uppercase tracking-[0.8em]">AI Content Squad</span>
            </div>
          )}
        </main>

        <aside className={`w-80 border-l ${t.border} ${t.sidebarBg} flex flex-col shrink-0 min-h-0 transition-colors duration-300`}>
          <div className={`p-6 border-b ${t.border} ${t.panelBg}`}>
            <h2 className={`text-[10px] font-bold ${t.textMuted} uppercase tracking-[0.3em]`}>Status da Equipe</h2>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
            {Object.values(AGENT_DATA).map(agent => (
              <AgentCard 
                key={agent.id} 
                agent={agent} 
                isWorking={currentAgent === agent.id} 
                isDone={activeTask?.steps.some(s => s.agent === agent.id && s.status === 'COMPLETED') || false} 
                isRejected={activeTask?.steps.some(s => s.agent === agent.id && s.status === 'REJECTED') || false}
                theme={t}
              />
            ))}
          </div>
        </aside>
      </div>

      {isProjectModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
          <div className={`${t.appBg} border ${t.border} w-full max-w-5xl h-[80vh] rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300`}>
            <div className={`p-8 border-b ${t.border} flex justify-between items-center`}>
              <div className="flex items-center gap-4">
                <div className={`${t.accentBg} p-2.5 rounded-2xl shadow-lg`}>
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <div>
                  <h2 className={`text-base font-bold ${t.textMain} uppercase tracking-[0.2em]`}>Configuração Editorial</h2>
                  <p className={`text-[10px] ${t.textMuted} uppercase font-bold tracking-widest`}>Defina o DNA da Squad</p>
                </div>
              </div>
              <button onClick={() => setIsProjectModalOpen(false)} className={`p-2 ${t.textMuted} hover:${t.textMain} transition-all ${t.buttonSecondary} rounded-full`}><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" strokeWidth={2.5}/></svg></button>
            </div>
            <div className="flex flex-1 min-h-0">
              <div className={`w-1/3 border-r ${t.border} ${t.sidebarBg} p-6 space-y-2`}>
                {projectSections.map((section, idx) => (
                  <button key={idx} onClick={() => setActiveProjectSection(idx)} className={`w-full text-left p-5 rounded-2xl transition-all border ${activeProjectSection === idx ? `${t.accentBg} ${t.accentBorder} shadow-lg text-white` : `${t.inputBg} ${t.border} ${t.textSec} hover:opacity-80`}`}>
                    <span className="text-[11px] font-bold uppercase tracking-widest">{section.label}</span>
                  </button>
                ))}
              </div>
              <div className="w-2/3 p-10 flex flex-col">
                <div className="mb-6">
                  <h3 className={`text-lg font-bold ${t.textMain} uppercase tracking-widest mb-2`}>{activeProject.label}</h3>
                  <p className={`text-[11px] ${t.textMuted} font-medium uppercase tracking-tight`}>{activeProject.desc}</p>
                </div>
                <div className="flex-1 flex flex-col">
                  <textarea value={activeProject.val} onChange={e => activeProject.set(e.target.value)} className={`w-full flex-1 ${t.inputBg} border ${t.border} rounded-2xl px-6 py-6 text-sm ${t.textMain} outline-none resize-none focus:border-${t.accent}-500 transition-all shadow-inner leading-relaxed`} placeholder={`Descreva aqui...`} />
                </div>
              </div>
            </div>
            <div className={`p-8 border-t ${t.border} ${t.panelBg} flex justify-end`}>
              <button onClick={() => setIsProjectModalOpen(false)} className={`px-14 py-4 ${t.accentBg} text-white text-[11px] font-bold uppercase rounded-2xl shadow-xl tracking-[0.2em]`}>Salvar Alterações</button>
            </div>
          </div>
        </div>
      )}

      {isPromptEditorOpen && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
          <div className={`${t.appBg} border ${t.border} w-full max-w-6xl h-[90vh] rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300`}>
            <div className={`p-8 border-b ${t.border} flex justify-between items-center ${t.panelBg} sticky top-0`}>
              <div className="flex items-center gap-4">
                <div className={`${t.cardBg} p-2.5 rounded-2xl shadow-lg border ${t.border}`}>
                  <svg className={`w-6 h-6 ${t.accentText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  </svg>
                </div>
                <div>
                  <h2 className={`text-base font-bold ${t.textMain} uppercase tracking-[0.2em]`}>Instruções da Squad</h2>
                </div>
              </div>
              <button onClick={() => setIsPromptEditorOpen(false)} className={`p-2 ${t.textMuted} hover:${t.textMain} transition-all ${t.buttonSecondary} rounded-full`}><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" strokeWidth={2.5}/></svg></button>
            </div>
            <div className="flex flex-1 min-h-0">
               <div className={`w-1/4 border-r ${t.border} ${t.sidebarBg} p-6 space-y-4`}>
                  {Object.values(AgentRole).map(role => (
                    <button key={role} onClick={() => setActivePromptRole(role)} className={`w-full text-left p-5 rounded-2xl transition-all border flex flex-col gap-2 ${activePromptRole === role ? `${t.accentBg} ${t.accentBorder} shadow-lg text-white` : `${t.inputBg} ${t.border} ${t.textSec} hover:opacity-80`}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${activePromptRole === role ? 'bg-white' : AGENT_DATA[role].color}`}></div>
                        <span className="text-[11px] font-bold uppercase tracking-widest">{AGENT_DATA[role].name}</span>
                      </div>
                    </button>
                  ))}
               </div>
               <div className="w-3/4 p-10 flex flex-col">
                  <textarea value={agentPrompts[activePromptRole]} onChange={(e) => setAgentPrompts(prev => ({ ...prev, [activePromptRole]: e.target.value }))} className={`w-full flex-1 ${t.inputBg} border ${t.border} rounded-[2rem] p-8 text-[13px] font-mono ${t.accentText} outline-none resize-none leading-relaxed focus:border-${t.accent}-500 shadow-inner`} />
               </div>
            </div>
            <div className={`p-8 border-t ${t.border} ${t.panelBg} flex justify-between items-center`}>
              <button onClick={() => setAgentPrompts(DEFAULT_PROMPTS)} className={`text-[10px] font-bold ${t.textMuted} uppercase hover:${t.textMain} tracking-widest px-8 py-3 rounded-2xl border ${t.border}`}>Resetar Fábrica</button>
              <button onClick={() => setIsPromptEditorOpen(false)} className={`px-14 py-4 ${t.accentBg} text-white text-[11px] font-bold uppercase rounded-2xl shadow-xl tracking-[0.2em]`}>Salvar Prompts</button>
            </div>
          </div>
        </div>
      )}
      
      <footer className={`h-8 ${t.panelBg} border-t ${t.border} flex items-center px-6 justify-between shrink-0`}>
          <div className="flex items-center gap-6">
              <span className={`text-[9px] ${t.textMuted} uppercase font-bold tracking-[0.2em]`}>Squad Core v6.0.0</span>
          </div>
          <div className={`text-[9px] ${t.textSec} font-mono uppercase tracking-widest`}>Gemini 3 Pro + 2.5 Image Engine</div>
      </footer>
    </div>
  );
};

export default App;
