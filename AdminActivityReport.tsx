
import React, { useState } from 'react';
import { Vehicle, PreventiveTask } from '../types';
import { Card, Input } from '../components/UI';

interface AdminPreventiveMaintenanceProps {
  vehicles: Vehicle[];
  onUpdateVehicle: (id: string, update: Partial<Vehicle>) => void;
  onBack: () => void;
}

const AdminPreventiveMaintenance: React.FC<AdminPreventiveMaintenanceProps> = ({ vehicles, onUpdateVehicle, onBack }) => {
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskKm, setNewTaskKm] = useState('');
  const [newTaskDate, setNewTaskDate] = useState('');

  const handleAddTask = (vehicle: Vehicle) => {
    if (!newTaskDesc || (!newTaskKm && !newTaskDate)) {
      alert("Defina pelo menos um KM alvo ou uma Data prevista.");
      return;
    }

    const newTask: PreventiveTask = {
      id: crypto.randomUUID(),
      descricao: newTaskDesc,
      kmAlvo: newTaskKm ? Number(newTaskKm) : 0,
      dataProgramada: newTaskDate || undefined
    };

    const currentTasks = vehicle.preventiveTasks || [];
    onUpdateVehicle(vehicle.id, {
      preventiveTasks: [...currentTasks, newTask]
    });

    setNewTaskDesc('');
    setNewTaskKm('');
    setNewTaskDate('');
  };

  const handleRemoveTask = (vehicle: Vehicle, taskId: string) => {
    const currentTasks = vehicle.preventiveTasks || [];
    onUpdateVehicle(vehicle.id, {
      preventiveTasks: currentTasks.filter(t => t.id !== taskId)
    });
  };

  const isTaskOverdue = (task: PreventiveTask, currentKm: number) => {
    const kmOverdue = task.kmAlvo > 0 && currentKm >= task.kmAlvo;
    const dateOverdue = task.dataProgramada && new Date() >= new Date(task.dataProgramada);
    return kmOverdue || dateOverdue;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Plano Preventivo</h2>
          <p className="text-slate-500">Programação por KM e Data</p>
        </div>
        <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 px-6 py-2 rounded-xl font-bold transition-all border border-slate-700 text-sm">
          Voltar
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {vehicles.map(v => (
          <Card key={v.id} className="relative overflow-hidden border-slate-800 hover:border-blue-900/50 transition-all">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 shadow-inner">
                    <span className="font-mono text-2xl font-black text-white tracking-widest">{v.placa}</span>
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest">{v.modelo}</div>
                    <div className="text-sm font-bold text-blue-400">KM Atual: {v.kmAtual.toLocaleString()}</div>
                  </div>
                </div>
                
                <button 
                  onClick={() => setExpandedVehicle(expandedVehicle === v.id ? null : v.id)}
                  className="bg-blue-900/20 text-blue-400 hover:bg-blue-900/40 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all"
                >
                  {expandedVehicle === v.id ? 'Fechar' : 'Gerenciar Linhas'}
                </button>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-slate-800 pb-2">Itens de Manutenção</h4>
                
                {(!v.preventiveTasks || v.preventiveTasks.length === 0) && (
                  <div className="py-8 text-center text-slate-600 text-sm border border-dashed border-slate-800 rounded-xl">
                    Nenhuma revisão programada.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2">
                  {v.preventiveTasks?.map(task => {
                    const overdue = isTaskOverdue(task, v.kmAtual);
                    
                    return (
                      <div key={task.id} className={`bg-slate-950/50 border ${overdue ? 'border-red-900/50 bg-red-900/5' : 'border-slate-800'} p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {overdue && <span className="text-red-500 animate-pulse">⚠️</span>}
                            <div className="text-sm font-bold text-slate-100">{task.descricao}</div>
                          </div>
                          <div className="flex gap-4 mt-1">
                            {task.kmAlvo > 0 && (
                               <div className="text-[10px] font-bold text-slate-500 uppercase">Alvo: {task.kmAlvo.toLocaleString()} KM</div>
                            )}
                            {task.dataProgramada && (
                               <div className="text-[10px] font-bold text-slate-500 uppercase">Data: {new Date(task.dataProgramada).toLocaleDateString()}</div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className={`text-[10px] font-black uppercase px-2 py-1 rounded ${overdue ? 'bg-red-900 text-white' : 'bg-slate-800 text-slate-400'}`}>
                            {overdue ? 'VENCIDA / ATINGIDA' : 'PROGRAMADA'}
                          </div>
                          <button onClick={() => handleRemoveTask(v, task.id)} className="text-slate-600 hover:text-red-500">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {expandedVehicle === v.id && (
                  <div className="mt-4 p-6 bg-slate-900 border border-blue-900/30 rounded-2xl animate-slideDown">
                    <h5 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-4">Nova Linha de Revisão</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Descrição</label>
                        <input type="text" value={newTaskDesc} onChange={(e) => setNewTaskDesc(e.target.value)} placeholder="Ex: Óleo de Câmbio" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">KM Alvo</label>
                        <input type="number" value={newTaskKm} onChange={(e) => setNewTaskKm(e.target.value)} placeholder="KM alvo" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Ou Data Limite</label>
                        <input type="date" value={newTaskDate} onChange={(e) => setNewTaskDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white" />
                      </div>
                      <button onClick={() => handleAddTask(v)} className="bg-emerald-600 hover:bg-emerald-500 text-white h-[42px] px-6 rounded-lg font-bold text-sm">SALVAR</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminPreventiveMaintenance;
