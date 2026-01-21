
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './services/supabase';
import { AgentRole, Task, ProjectConfig, Step, TaskStatus } from './types';
import { geminiService } from './services/gemini';
import { DEFAULT_PROMPTS, AGENTS, THEME_CONFIGS } from './constants';
import ReactMarkdown from 'react-markdown';
import AgentCard from './components/AgentCard';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Login State
  const [email, setEmail] = useState('marcelomonso.art@gmail.com');
  const [password, setPassword] = useState('JojoPlatinado1');
  
  // Dashboard State
  const [currentTopic, setCurrentTopic] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [config, setConfig] = useState<ProjectConfig>({
    objective: 'Produzir conteúdo de alta performance e originalidade',
    persona: 'Especialista em Tecnologia e Inovação',
    audience: 'Entusiastas de IA e Negócios',
    worldview: 'Focada em futuro, ética e produtividade'
  });

  const theme = THEME_CONFIGS.DARK;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchTasks();
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchTasks();
    });

    return () => subscription.unsubscribe();
  }, []);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [tasks, activeTaskId, isProcessing]);

  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, steps(*)')
      .order('created_at', { ascending: false });
    
    if (data) {
      setTasks(data.map(t => ({
        ...t,
        createdAt: new Date(t.created_at),
        steps: t.steps.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                      .map((s: any) => ({ ...s, timestamp: new Date(s.timestamp || s.created_at) }))
      })));
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert("Verifique seu email!");
    else if (error) alert(error.message);
  };

  const createStep = async (taskId: string, agent: AgentRole, content: string, status: any = 'COMPLETED', feedback?: string) => {
    const { data, error } = await supabase
      .from('steps')
      .insert({
        task_id: taskId,
        agent,
        content,
        feedback,
        status,
        timestamp: new Date()
      })
      .select()
      .single();
    
    if (error) console.error("Erro ao criar step:", error);
    return data;
  };

  const updateTaskStatus = async (taskId: string, status: TaskStatus, finalContent?: string, imageUrl?: string) => {
    await supabase
      .from('tasks')
      .update({ status, final_content: finalContent, image_url: imageUrl })
      .eq('id', taskId);
    fetchTasks();
  };

  const handleDeleteTask = async (e: React.MouseEvent, taskId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!window.confirm("Tem certeza que deseja apagar esta missão do histórico permanentemente?")) return;

    // 1. Delete steps first to maintain integrity (if cascade isn't set on DB)
    await supabase.from('steps').delete().eq('task_id', taskId);
    
    // 2. Delete the task
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);

    if (error) {
      alert("Erro ao deletar: " + error.message);
      return;
    }

    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (activeTaskId === taskId) {
      setActiveTaskId(null);
    }
  };

  const handleCreateTask = async () => {
    if (!currentTopic.trim() || isProcessing) return;

    setIsProcessing(true);
    const { data: taskData, error } = await supabase
      .from('tasks')
      .insert({
        user_id: session.user.id,
        topic: currentTopic,
        status: 'PROCESSING'
      })
      .select()
      .single();

    if (error) {
      alert("Erro ao criar tarefa: " + error.message);
      setIsProcessing(false);
      return;
    }

    const taskId = taskData.id;
    setActiveTaskId(taskId);
    setCurrentTopic('');
    fetchTasks();

    try {
      // 1. PESQUISADOR (Agent 0)
      let researchContent = "";
      try {
        const res = await geminiService.research(taskData.topic, config, DEFAULT_PROMPTS[AgentRole.RESEARCHER]);
        researchContent = res.content;
        await createStep(taskId, AgentRole.RESEARCHER, researchContent);
        fetchTasks();
      } catch (e) {
        console.error("Pesquisa falhou, seguindo sem ela", e);
      }

      // 2. ESCRITOR (Agent 1)
      const article = await geminiService.write(researchContent, { ...config, topic: taskData.topic } as any, DEFAULT_PROMPTS[AgentRole.WRITER]);
      await createStep(taskId, AgentRole.WRITER, article);
      fetchTasks();

      // 3. REVISOR (Agent 2)
      let currentContent = article;
      const reviewResult = await geminiService.review(currentContent, config, DEFAULT_PROMPTS[AgentRole.REVIEWER]);
      await createStep(taskId, AgentRole.REVIEWER, "Análise concluída", reviewResult.approved ? 'COMPLETED' : 'REJECTED', reviewResult.feedback);
      fetchTasks();

      // 4. CORRETOR (Se necessário)
      if (!reviewResult.approved) {
        const corrected = await geminiService.write(currentContent, { ...config, feedback: reviewResult.feedback } as any, DEFAULT_PROMPTS[AgentRole.CORRECTOR]);
        currentContent = corrected;
        await createStep(taskId, AgentRole.CORRECTOR, corrected);
        fetchTasks();
      }

      // 5. DESIGNER (Final)
      const imageUrl = await geminiService.generateArt(currentContent, DEFAULT_PROMPTS[AgentRole.DESIGNER]);
      
      await updateTaskStatus(taskId, 'COMPLETED', currentContent, imageUrl);

    } catch (err) {
      console.error(err);
      await updateTaskStatus(taskId, 'FAILED');
    } finally {
      setIsProcessing(false);
      // setActiveTaskId(null); // Keep active to see result
    }
  };

  const activeTask = tasks.find(t => t.id === activeTaskId) || tasks[0];

  if (loading) return <div className="h-full bg-slate-950 flex items-center justify-center text-white font-mono uppercase tracking-widest animate-pulse">Iniciando Redação...</div>;

  if (!session) {
    return (
      <div className="h-full bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8 bg-slate-900/50 p-10 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl">
          <div className="text-center">
            <h1 className="text-4xl font-black text-white uppercase tracking-tighter leading-none">Squad IA</h1>
            <p className="text-slate-500 text-[10px] mt-4 font-bold tracking-[0.3em] uppercase">Múltiplos Agentes • Google Gemini 3</p>
          </div>
          <form className="space-y-4" onSubmit={handleLogin}>
            <input type="email" placeholder="Email" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl p-4 text-white placeholder:text-slate-600 focus:border-indigo-500 outline-none transition-all" value={email} onChange={e => setEmail(e.target.value)} />
            <input type="password" placeholder="Senha" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl p-4 text-white placeholder:text-slate-600 focus:border-indigo-500 outline-none transition-all" value={password} onChange={e => setPassword(e.target.value)} />
            <div className="flex flex-col gap-3 pt-4">
              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98]">ENTRAR NO SQUAD</button>
              <button type="button" onClick={handleSignUp} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold py-3 rounded-2xl transition-all text-sm uppercase tracking-widest">Criar Nova Conta</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-950 flex flex-col text-slate-300 overflow-hidden">
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-slate-900/30 backdrop-blur-xl z-50 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
          <span className="font-black text-white uppercase tracking-tighter text-lg leading-none">AI Squad</span>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono text-white/50">{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()} className="text-[10px] font-bold text-red-500 uppercase hover:text-red-400 transition-colors">Sair</button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        
        {/* COLUNA 1: HISTÓRICO E INPUT (ESQUERDA) */}
        <aside className="w-72 border-r border-white/5 flex flex-col bg-slate-900/20">
          <div className="p-4 border-b border-white/5">
             <h2 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-3">Nova Missão</h2>
             <textarea 
                placeholder="Ex: Artigo sobre o futuro das baterias de estado sólido..." 
                className="w-full bg-slate-950 rounded-xl p-3 text-xs h-24 border border-white/10 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700 resize-none"
                value={currentTopic}
                onChange={e => setCurrentTopic(e.target.value)}
                disabled={isProcessing}
              />
              <button 
                onClick={handleCreateTask}
                disabled={isProcessing || !currentTopic.trim()}
                className={`w-full mt-2 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all ${
                  isProcessing ? 'bg-slate-800 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                {isProcessing ? 'Processando...' : 'Enviar para Fila'}
              </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
            <h2 className="px-2 pt-4 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-600">Histórico</h2>
            {tasks.map(task => (
               <div 
                key={task.id} 
                className={`group w-full mb-1 flex items-stretch rounded-lg border transition-all ${
                  activeTask?.id === task.id ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-transparent border-transparent hover:bg-white/5'
                }`}
               >
                 {/* Botão de Seleção (Área Principal) */}
                 <button 
                  onClick={() => setActiveTaskId(task.id)}
                  className="flex-1 text-left p-3 min-w-0 focus:outline-none"
                 >
                   <p className={`text-xs font-bold line-clamp-2 leading-tight mb-1 ${activeTask?.id === task.id ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>
                     {task.topic}
                   </p>
                   <div className="flex items-center justify-between mt-1">
                     <span className={`text-[8px] font-black uppercase tracking-wider ${
                       task.status === 'COMPLETED' ? 'text-emerald-500' : 
                       task.status === 'FAILED' ? 'text-red-500' : 'text-amber-500'
                     }`}>{task.status === 'PROCESSING' ? '● Em progresso' : task.status}</span>
                   </div>
                 </button>

                 {/* Botão de Deletar (Lateral e isolado, layout flex) */}
                 <button 
                  onClick={(e) => handleDeleteTask(e, task.id)}
                  className="w-10 flex items-center justify-center text-slate-600 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                  title="Excluir do histórico"
                 >
                   <svg className="w-4 h-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                   </svg>
                 </button>
               </div>
             ))}
          </div>
        </aside>

        {/* COLUNA 2: CHAT STREAM (CENTRO) */}
        <section className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden">
          {activeTask ? (
            <>
              {/* Header do Chat */}
              <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-slate-900/20 backdrop-blur">
                <h2 className="font-bold text-slate-200 truncate pr-4">{activeTask.topic}</h2>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
                  ID: {activeTask.id.slice(0,8)}
                </div>
              </div>

              {/* Área de Scroll do Chat */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8" ref={scrollRef}>
                
                {/* Intro Message */}
                <div className="flex justify-center pb-4">
                  <span className="text-[10px] bg-slate-800/50 text-slate-500 px-3 py-1 rounded-full uppercase tracking-widest">Início da Produção</span>
                </div>

                {/* Steps Mapping */}
                {activeTask.steps.length === 0 && isProcessing && (
                   <div className="text-center py-12 animate-pulse">
                      <p className="text-xs text-slate-500 uppercase tracking-widest">Iniciando protocolos...</p>
                   </div>
                )}

                {activeTask.steps.map((step, idx) => {
                  const agentInfo = AGENTS[step.agent as AgentRole];
                  const isReviewer = step.agent === AgentRole.REVIEWER;
                  const isRejected = step.status === 'REJECTED';
                  
                  return (
                    <div key={idx} className={`flex gap-4 max-w-4xl mx-auto ${isReviewer ? 'flex-row-reverse' : ''}`}>
                      
                      {/* Avatar */}
                      <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-lg mt-1 ${agentInfo?.color || 'bg-slate-700'}`}>
                        {agentInfo?.name.charAt(0) || 'U'}
                      </div>

                      {/* Content Bubble */}
                      <div className={`flex-1 min-w-0 rounded-2xl p-6 border shadow-xl ${
                        isReviewer 
                          ? 'bg-slate-900/80 border-amber-500/20 rounded-tr-none' 
                          : 'bg-slate-900/40 border-white/5 rounded-tl-none'
                      }`}>
                        <div className={`flex items-center justify-between mb-4 pb-3 border-b ${isReviewer ? 'border-amber-500/10' : 'border-white/5'}`}>
                           <span className={`text-xs font-black uppercase tracking-widest ${isReviewer ? 'text-amber-500' : 'text-indigo-400'}`}>
                             {agentInfo?.name || step.agent}
                           </span>
                           <span className="text-[9px] text-slate-600 font-mono">{step.timestamp.toLocaleTimeString()}</span>
                        </div>

                        <div className="prose prose-invert prose-sm max-w-none prose-p:text-slate-300 prose-headings:text-slate-100">
                           {step.feedback ? (
                             <div className="bg-red-500/5 border border-red-500/10 p-4 rounded-lg mb-4">
                                <p className="text-red-400 font-bold text-xs uppercase mb-1">Feedback Crítico:</p>
                                <p className="text-red-200/80 italic">"{step.feedback}"</p>
                             </div>
                           ) : null}
                           
                           {/* Renderização condicional baseada no agente */}
                           {step.agent === AgentRole.RESEARCHER ? (
                             <div className="space-y-2">
                               <p className="text-xs font-bold text-slate-500 uppercase">Dossiê de Pesquisa:</p>
                               <div className="text-slate-300 text-sm whitespace-pre-wrap font-mono bg-black/20 p-4 rounded-lg border border-white/5">
                                 {step.content}
                               </div>
                             </div>
                           ) : (
                             <ReactMarkdown>{step.content}</ReactMarkdown>
                           )}
                        </div>

                        {isRejected && (
                          <div className="mt-4 pt-3 border-t border-red-500/20 flex items-center gap-2 text-red-500">
                             <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                             <span className="text-[10px] font-bold uppercase tracking-widest">Solicitado Retrabalho</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Final Image if exists */}
                {activeTask.imageUrl && (
                  <div className="flex gap-4 max-w-4xl mx-auto">
                     <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-lg mt-1 ${AGENTS.DESIGNER.color}`}>D</div>
                     <div className="flex-1 rounded-2xl p-1 bg-slate-900 border border-white/5 overflow-hidden rounded-tl-none">
                        <img src={activeTask.imageUrl} className="w-full rounded-xl" alt="Final Art" />
                     </div>
                  </div>
                )}

                {/* Loading Indicator inside chat */}
                {isProcessing && activeTask.id === activeTaskId && (
                   <div className="flex justify-center py-4">
                      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 rounded-full border border-white/5">
                         <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                         <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                         <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                         <span className="text-[10px] text-indigo-400 uppercase tracking-widest ml-2">Agente digitando...</span>
                      </div>
                   </div>
                )}
                
                <div className="h-12"></div> {/* Spacer bottom */}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 opacity-50">
               <div className="w-16 h-16 border-2 border-dashed border-slate-700 rounded-full mb-4 flex items-center justify-center">
                 <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8H8c-4.418 0-8-3.582-8-8V8c0-4.418 3.582-8 8-8h5c4.418 0 8 3.582 8 8v4z" /></svg>
               </div>
               <p className="text-xs uppercase tracking-widest font-bold">Aguardando início da operação</p>
            </div>
          )}
        </section>

        {/* COLUNA 3: SQUAD (DIREITA) */}
        <aside className="w-80 bg-slate-950 border-l border-white/5 flex flex-col">
          <div className="p-4 border-b border-white/5 bg-slate-900/10">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Squad Ativo</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {Object.values(AGENTS).map(agent => {
              const step = activeTask?.steps.find(s => s.agent === agent.id);
              // Lógica de "Quem está trabalhando agora"
              const isWorking = isProcessing && activeTaskId === activeTask?.id && !step && (
                (agent.id === AgentRole.RESEARCHER) || 
                (agent.id === AgentRole.WRITER && activeTask.steps.some(s => s.agent === AgentRole.RESEARCHER)) ||
                (agent.id === AgentRole.REVIEWER && activeTask.steps.some(s => s.agent === AgentRole.WRITER)) ||
                (agent.id === AgentRole.CORRECTOR && activeTask.steps.some(s => s.agent === AgentRole.REVIEWER && s.status === 'REJECTED')) ||
                (agent.id === AgentRole.DESIGNER && activeTask.status === 'COMPLETED' && !activeTask.imageUrl)
              );

              return (
                <AgentCard 
                  key={agent.id}
                  agent={agent} 
                  isWorking={isWorking}
                  isDone={!!step && step.status === 'COMPLETED'}
                  isRejected={!!step && step.status === 'REJECTED'}
                  theme={theme}
                />
              )
            })}
          </div>
        </aside>

      </main>
    </div>
  );
}
