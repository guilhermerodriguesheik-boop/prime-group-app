
import React, { useState, useMemo } from 'react';
import { DailyRoute, RouteDeparture, User, UserRole, Fueling, MaintenanceRequest } from '../types';
import { Card, Select, Input } from '../components/UI';

interface AdminActivityReportProps {
  dailyRoutes: DailyRoute[];
  routes: RouteDeparture[];
  fuelings: Fueling[];
  maintenances: MaintenanceRequest[];
  users: User[];
  onUpdateDailyRoute: (id: string, update: Partial<DailyRoute>) => void;
  onUpdateRoute: (id: string, update: Partial<RouteDeparture>) => void;
  onUpdateFueling: (id: string, update: Partial<Fueling>) => void;
  onUpdateMaintenance: (id: string, update: Partial<MaintenanceRequest>) => void;
  onBack: () => void;
}

const AdminActivityReport: React.FC<AdminActivityReportProps> = ({ 
  dailyRoutes, 
  routes, 
  fuelings, 
  maintenances, 
  users, 
  onUpdateDailyRoute,
  onUpdateRoute,
  onUpdateFueling,
  onUpdateMaintenance,
  onBack 
}) => {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'frete' | 'motorista' | 'ajudante' | 'valor'>('frete');
  const [editValue, setEditValue] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const operationalUsers = useMemo(() => {
    return users.filter(u => u.perfil !== UserRole.ADMIN && u.ativo);
  }, [users]);

  const getUserName = (id: string) => users.find(u => u.id === id)?.nome || 'N/A';

  const filteredReport = useMemo(() => {
    if (!selectedUserId || !startDate || !endDate) return [];

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    let activities: any[] = [];

    // 1. Rota do Dia
    const vDaily = dailyRoutes.filter(dr => 
      (dr.motoristaId === selectedUserId || dr.ajudanteId === selectedUserId) &&
      new Date(dr.createdAt) >= start &&
      new Date(dr.createdAt) <= end
    ).map(dr => ({
      id: dr.id,
      data: dr.createdAt,
      placa: dr.placa,
      tipo: 'Rota do Dia',
      cliente: dr.clienteNome || 'N/A',
      destino: dr.destino,
      oc: dr.oc,
      valorFrete: dr.valorFrete || 0,
      valorMotorista: dr.valorMotorista || 0,
      valorAjudante: dr.valorAjudante || 0,
      categoria: 'operacional',
      sourceType: 'daily',
      isAjudante: dr.ajudanteId === selectedUserId,
      adminAuditId: dr.adminFinanceiroId
    }));

    // 2. Saídas/OC
    const vRoutes = routes.filter(r => 
      (r.ajudanteId === selectedUserId || r.motoristaId === selectedUserId) &&
      new Date(r.createdAt) >= start &&
      new Date(r.createdAt) <= end
    ).map(r => ({
      id: r.id,
      data: r.createdAt,
      placa: r.placa,
      tipo: 'Saída/OC',
      cliente: r.clienteNome || 'N/A',
      destino: r.destino,
      oc: r.oc,
      valorFrete: r.valorFrete || 0,
      valorMotorista: r.valorMotorista || 0,
      valorAjudante: r.valorAjudante || 0,
      categoria: 'operacional',
      sourceType: 'route',
      isAjudante: r.ajudanteId === selectedUserId,
      adminAuditId: r.adminFinanceiroId
    }));

    // 3. Abastecimentos
    const vFuelings = fuelings.filter(f => 
      f.motoristaId === selectedUserId &&
      new Date(f.createdAt) >= start &&
      new Date(f.createdAt) <= end
    ).map(f => ({
      id: f.id,
      data: f.createdAt,
      placa: f.placa,
      tipo: 'Abastecimento',
      cliente: 'Posto Conveniado',
      destino: 'N/A',
      oc: `Nota: ${f.id.slice(0,8)}`,
      valor: f.valor || 0,
      categoria: 'financeiro',
      sourceType: 'fuel',
      adminAuditId: f.adminAprovadorId
    }));

    // 4. Manutenções
    const vMaintenances = maintenances.filter(m => 
      m.motoristaId === selectedUserId &&
      new Date(m.createdAt) >= start &&
      new Date(m.createdAt) <= end
    ).map(m => ({
      id: m.id,
      data: m.createdAt,
      placa: m.placa,
      tipo: `Manutenção ${m.tipo}`,
      cliente: 'Solicitação Oficina',
      destino: m.descricao,
      oc: 'N/A',
      valor: m.valor || 0,
      categoria: 'financeiro',
      sourceType: 'maintenance',
      adminAuditId: m.adminResponsavelId
    }));

    activities = [...vDaily, ...vRoutes, ...vFuelings, ...vMaintenances];
    return activities.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [selectedUserId, startDate, endDate, dailyRoutes, routes, fuelings, maintenances]);

  const stats = useMemo(() => {
    const uniqueDates = new Set(filteredReport.map(a => new Date(a.data).toLocaleDateString()));
    const totalFrete = filteredReport.reduce((sum, item) => sum + (item.valorFrete || 0), 0);
    const totalGanhos = filteredReport.reduce((sum, item) => {
      if (item.sourceType === 'daily' || item.sourceType === 'route') {
        return sum + (item.isAjudante ? item.valorAjudante : item.valorMotorista);
      }
      return sum + (item.valor || 0);
    }, 0);
    
    return {
      workedDays: uniqueDates.size,
      totalActivities: filteredReport.length,
      totalFrete,
      totalGanhos
    };
  }, [filteredReport]);

  const handleStartEdit = (id: string, field: 'frete' | 'motorista' | 'ajudante' | 'valor', val: number) => {
    setEditingId(id);
    setEditingField(field);
    setEditValue(val.toString());
  };

  const handleSaveEdit = (activity: any) => {
    const newVal = Number(editValue) || 0;
    const isDaily = activity.sourceType === 'daily';
    const updateFn = isDaily ? onUpdateDailyRoute : onUpdateRoute;

    if (activity.sourceType === 'daily' || activity.sourceType === 'route') {
      const updateObj: any = {};
      if (editingField === 'frete') updateObj.valorFrete = newVal;
      if (editingField === 'motorista') updateObj.valorMotorista = newVal;
      if (editingField === 'ajudante') updateObj.valorAjudante = newVal;
      updateFn(activity.id, updateObj);
    } else if (activity.sourceType === 'fuel') {
      onUpdateFueling(activity.id, { valor: newVal });
    } else if (activity.sourceType === 'maintenance') {
      onUpdateMaintenance(activity.id, { valor: newVal });
    }
    setEditingId(null);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Relatório de Atividade</h2>
          <p className="text-slate-500 text-sm italic">Gestão Financeira por Colaborador</p>
        </div>
        <div className="flex gap-2">
          {filteredReport.length > 0 && (
            <>
              <button 
                onClick={() => setViewMode(viewMode === 'cards' ? 'table' : 'cards')} 
                className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl font-bold border border-slate-700 text-xs flex items-center gap-2"
              >
                {viewMode === 'cards' ? '📊 Ver Planilha' : '📱 Ver Cards'}
              </button>
              <button onClick={() => window.print()} className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-xl font-bold border border-blue-600 text-xs flex items-center gap-2">
                🖨️ PDF
              </button>
            </>
          )}
          <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl font-bold border border-slate-700 text-xs">
            Voltar
          </button>
        </div>
      </div>

      <Card className="border-blue-900/30 no-print">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select 
            label="Selecione o Usuário" 
            value={selectedUserId} 
            onChange={setSelectedUserId}
            options={operationalUsers.map(u => ({ label: `${u.nome} (${u.perfil})`, value: u.id }))}
          />
          <Input label="Data Início" type="date" value={startDate} onChange={setStartDate} />
          <Input label="Data Fim" type="date" value={endDate} onChange={setEndDate} />
        </div>
      </Card>

      {selectedUserId && startDate && endDate && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-emerald-600/10 border border-emerald-600/20 p-6 rounded-2xl text-center card-report">
              <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Total Ganho (Líquido)</div>
              <div className="text-2xl font-black text-emerald-400">R$ {stats.totalGanhos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            </div>
            <div className="bg-blue-600/10 border border-blue-600/20 p-6 rounded-2xl text-center card-report">
              <div className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Dias de Operação</div>
              <div className="text-2xl font-black text-white">{stats.workedDays}</div>
            </div>
            <div className="bg-slate-900/50 p-6 rounded-2xl text-center card-report border border-slate-800">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Fretes Período</div>
              <div className="text-2xl font-black text-slate-400">R$ {stats.totalFrete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            </div>
            <div className="bg-slate-900/50 p-6 rounded-2xl text-center card-report border border-slate-800">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Registros</div>
              <div className="text-2xl font-black text-white">{stats.totalActivities}</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left border-collapse bg-slate-900/20">
              <thead className="bg-slate-950 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                <tr>
                  <th className="p-4">Data</th>
                  <th className="p-4">Placa</th>
                  <th className="p-4">Cliente/Destino</th>
                  <th className="p-4 text-right">Frete (Bruto)</th>
                  <th className="p-4 text-right">Ganho Colab.</th>
                  <th className="p-4 text-center">Audit</th>
                </tr>
              </thead>
              <tbody>
                {filteredReport.map((activity) => (
                  <tr key={activity.id} className="hover:bg-slate-900/50 border-b border-slate-800/50">
                    <td className="p-4 text-xs font-mono text-slate-400">{new Date(activity.data).toLocaleDateString('pt-BR')}</td>
                    <td className="p-4 text-xs font-bold text-blue-400 font-mono">{activity.placa}</td>
                    <td className="p-4">
                      <div className="text-xs font-bold text-slate-200">{activity.cliente}</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[150px]">{activity.destino}</div>
                    </td>
                    <td className="p-4 text-right">
                      {editingId === activity.id && editingField === 'frete' ? (
                        <input 
                          type="number" autoFocus value={editValue} 
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => { if(e.key === 'Enter') handleSaveEdit(activity); if(e.key === 'Escape') setEditingId(null); }}
                          className="w-20 bg-slate-950 border border-blue-500 rounded p-1 text-right text-xs"
                        />
                      ) : (
                        <button 
                          onClick={() => handleStartEdit(activity.id, 'frete', activity.valorFrete || 0)}
                          className="text-xs font-bold text-slate-500 hover:text-slate-300"
                        >
                          {(activity.valorFrete || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </button>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {editingId === activity.id && (editingField === 'motorista' || editingField === 'ajudante' || editingField === 'valor') ? (
                        <input 
                          type="number" autoFocus value={editValue} 
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => { if(e.key === 'Enter') handleSaveEdit(activity); if(e.key === 'Escape') setEditingId(null); }}
                          className="w-20 bg-slate-950 border border-blue-500 rounded p-1 text-right text-xs"
                        />
                      ) : (
                        <button 
                          onClick={() => {
                            const field = activity.sourceType === 'daily' || activity.sourceType === 'route' 
                              ? (activity.isAjudante ? 'ajudante' : 'motorista')
                              : 'valor';
                            const val = activity.isAjudante ? activity.valorAjudante : (activity.valorMotorista || activity.valor);
                            handleStartEdit(activity.id, field, val || 0);
                          }}
                          className="text-sm font-black text-emerald-500"
                        >
                          {(activity.isAjudante ? activity.valorAjudante : (activity.valorMotorista || activity.valor || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </button>
                      )}
                    </td>
                    <td className="p-4 text-center">
                       <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">
                         {activity.adminAuditId ? getUserName(activity.adminAuditId) : 'N/A'}
                       </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminActivityReport;
