
import React, { useState, useMemo } from 'react';
import { Fueling, MaintenanceRequest, Vehicle, FuelingStatus, DailyRoute, RouteDeparture, MaintenanceStatus, Toll, FixedExpense } from '../types';
import { Card, Badge, Input, Select } from '../components/UI';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, ComposedChart, Line } from 'recharts';

interface AdminVehicleReportProps {
  fuelings: Fueling[];
  maintenances: MaintenanceRequest[];
  vehicles: Vehicle[];
  dailyRoutes: DailyRoute[];
  routes: RouteDeparture[];
  tolls: Toll[];
  fixedExpenses: FixedExpense[];
  onBack: () => void;
  onUpdateDailyRoute: (id: string, update: Partial<DailyRoute>) => void;
  onUpdateRoute: (id: string, update: Partial<RouteDeparture>) => void;
}

const AdminVehicleReport: React.FC<AdminVehicleReportProps> = ({ 
  fuelings, 
  maintenances, 
  vehicles, 
  dailyRoutes, 
  routes, 
  tolls,
  fixedExpenses,
  onBack 
}) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [viewMode, setViewMode] = useState<'visual' | 'table'>('visual');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');

  const dateFilteredData = useMemo(() => {
    if (!startDate || !endDate) return { f: fuelings, m: maintenances, dr: dailyRoutes, r: routes, t: tolls, fe: fixedExpenses };
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    const filterYearMonth = startDate.slice(0, 7);

    return {
      f: fuelings.filter(x => new Date(x.createdAt) >= start && new Date(x.createdAt) <= end),
      m: maintenances.filter(x => new Date(x.createdAt) >= start && new Date(x.createdAt) <= end),
      dr: dailyRoutes.filter(x => new Date(x.createdAt) >= start && new Date(x.createdAt) <= end),
      r: routes.filter(x => new Date(x.createdAt) >= start && new Date(x.createdAt) <= end),
      t: tolls.filter(x => new Date(x.data) >= start && new Date(x.data) <= end),
      fe: fixedExpenses.filter(x => x.dataCompetencia === filterYearMonth)
    };
  }, [startDate, endDate, fuelings, maintenances, dailyRoutes, routes, tolls, fixedExpenses]);

  const vehicleStats = useMemo(() => {
    const { f, m, dr, r, t } = dateFilteredData;
    return vehicles.map(v => {
      const vFuelings = f.filter(fuel => fuel.vehicleId === v.id && fuel.status === FuelingStatus.APROVADO);
      const vMaintenances = m.filter(maint => maint.vehicleId === v.id && maint.status === MaintenanceStatus.FEITA);
      const vDailyRoutes = dr.filter(daily => daily.vehicleId === v.id);
      const vRoutes = r.filter(route => route.vehicleId === v.id);
      const vTolls = t.filter(toll => toll.vehicleId === v.id);
      
      const gastoCombustivel = vFuelings.reduce((sum, fuel) => sum + fuel.valor, 0);
      const gastoManutencao = vMaintenances.reduce((sum, maint) => sum + (maint.valor || 0), 0);
      const gastoPedagio = vTolls.reduce((sum, toll) => sum + toll.valor, 0);
      const gastoEquipe = [...vDailyRoutes, ...vRoutes].reduce((sum, op) => sum + (op.valorMotorista || 0) + (op.valorAjudante || 0), 0);
      
      const totalFrete = [...vDailyRoutes, ...vRoutes].reduce((sum, op) => sum + (op.valorFrete || 0), 0);
      const totalCustos = gastoCombustivel + gastoManutencao + gastoPedagio + gastoEquipe;
      const lucroOp = totalFrete - totalCustos;

      return {
        id: v.id,
        placa: v.placa,
        modelo: v.modelo,
        totalFrete,
        totalCustos,
        lucroOp,
        gastoCombustivel,
        gastoManutencao,
        gastoPedagio,
        gastoEquipe,
        margem: totalFrete > 0 ? ((lucroOp / totalFrete) * 100) : 0
      };
    }).sort((a, b) => b.totalFrete - a.totalFrete);
  }, [vehicles, dateFilteredData]);

  const selectedVehicleStats = useMemo(() => {
    if (!selectedVehicleId) return null;
    return vehicleStats.find(s => s.id === selectedVehicleId);
  }, [selectedVehicleId, vehicleStats]);

  const individualBreakdownData = useMemo(() => {
    if (!selectedVehicleStats) return [];
    return [
      { name: 'Combustível', value: selectedVehicleStats.gastoCombustivel, color: '#3b82f6' },
      { name: 'Manutenção', value: selectedVehicleStats.gastoManutencao, color: '#f59e0b' },
      { name: 'Pedágio', value: selectedVehicleStats.gastoPedagio, color: '#8b5cf6' },
      { name: 'Equipe', value: selectedVehicleStats.gastoEquipe, color: '#ec4899' },
    ].filter(item => item.value > 0);
  }, [selectedVehicleStats]);

  const totalDespesasFixas = useMemo(() => {
    return dateFilteredData.fe.reduce((sum, e) => sum + e.valor, 0);
  }, [dateFilteredData]);

  const totals = useMemo(() => {
    const sumOp = vehicleStats.reduce((acc, curr) => ({
      frete: acc.frete + curr.totalFrete,
      custos: acc.custos + curr.totalCustos,
      lucroOp: acc.lucroOp + curr.lucroOp
    }), { frete: 0, custos: 0, lucroOp: 0 });

    return {
      ...sumOp,
      lucroLiquido: sumOp.lucroOp - totalDespesasFixas
    };
  }, [vehicleStats, totalDespesasFixas]);

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Relatório de Desempenho</h2>
          <p className="text-slate-500 text-sm">Análise consolidada e individual da frota</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setViewMode(viewMode === 'visual' ? 'table' : 'visual')} 
            className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl font-bold border border-slate-700 text-xs"
          >
            {viewMode === 'visual' ? '📑 Ver Planilha' : '📊 Ver Gráficos'}
          </button>
          <button onClick={() => window.print()} className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-xl font-bold border border-blue-600 text-xs">
            🖨️ PDF / Imprimir
          </button>
          <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl font-bold border border-slate-700 text-xs">
            Voltar
          </button>
        </div>
      </div>

      <Card className="border-blue-900/30 no-print">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <Input label="Data Início" type="date" value={startDate} onChange={setStartDate} />
          <Input label="Data Fim" type="date" value={endDate} onChange={setEndDate} />
          <Select 
            label="Análise Individual (Placa)" 
            value={selectedVehicleId} 
            onChange={setSelectedVehicleId}
            options={vehicles.map(v => ({ label: v.placa, value: v.id }))}
          />
        </div>
      </Card>

      {/* Cartões de Resumo Globais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-slate-900/50 border-slate-800 text-center">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Faturamento Bruto</div>
          <div className="text-xl font-black text-white">R$ {totals.frete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </Card>
        <Card className="bg-red-900/10 border-red-900/40 text-center">
          <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">Custos Frota (Var)</div>
          <div className="text-xl font-black text-white">R$ {totals.custos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </Card>
        <Card className="bg-indigo-900/10 border-indigo-900/40 text-center">
          <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">Despesas Fixas</div>
          <div className="text-xl font-black text-white">R$ {totalDespesasFixas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </Card>
        <Card className={`${totals.lucroLiquido >= 0 ? 'bg-emerald-900/10 border-emerald-900/40' : 'bg-red-900/20 border-red-900/50'} text-center`}>
          <div className={`text-[10px] font-black ${totals.lucroLiquido >= 0 ? 'text-emerald-500' : 'text-red-500'} uppercase tracking-widest mb-1`}>Lucro Real Consolidado</div>
          <div className={`text-xl font-black ${totals.lucroLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>R$ {totals.lucroLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </Card>
      </div>

      {/* Painel Individual (Se selecionado) */}
      {selectedVehicleStats && (
        <Card className="border-l-8 border-l-blue-600 bg-blue-900/5 animate-slideDown overflow-hidden">
          <div className="flex flex-col lg:flex-row gap-8">
            <div className="flex-1 space-y-6">
              <div className="flex items-center gap-4">
                <div className="bg-slate-950 px-6 py-2 rounded-xl border border-slate-800">
                  <span className="font-mono text-3xl font-black text-white tracking-widest">{selectedVehicleStats.placa}</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">{selectedVehicleStats.modelo}</h3>
                  <div className="text-xs font-black text-blue-500 uppercase tracking-widest">Análise de Desempenho Unitária</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Resultados Financeiros</div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Faturamento:</span>
                      <span className="text-sm font-bold text-emerald-400">R$ {selectedVehicleStats.totalFrete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Despesas Operacionais:</span>
                      <span className="text-sm font-bold text-red-400">R$ {selectedVehicleStats.totalCustos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                      <span className="text-xs font-black text-slate-200 uppercase">Lucro Operacional:</span>
                      <span className={`text-lg font-black ${selectedVehicleStats.lucroOp >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        R$ {selectedVehicleStats.lucroOp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 flex flex-col justify-center items-center">
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Margem de Lucro</div>
                  <div className={`text-4xl font-black ${selectedVehicleStats.margem >= 20 ? 'text-emerald-500' : selectedVehicleStats.margem > 0 ? 'text-blue-500' : 'text-red-500'}`}>
                    {selectedVehicleStats.margem.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-slate-600 font-bold uppercase mt-1">sobre o frete bruto</div>
                </div>
              </div>
            </div>

            <div className="lg:w-80 h-[240px] flex flex-col items-center">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Composição de Custos</div>
              <ResponsiveContainer width="100%" height="80%">
                <PieChart>
                  <Pie
                    data={individualBreakdownData}
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {individualBreakdownData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `R$ ${value.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                {individualBreakdownData.map(item => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="text-[9px] text-slate-400 font-black uppercase">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button 
            onClick={() => setSelectedVehicleId('')} 
            className="w-full mt-6 py-2 bg-slate-950 hover:bg-slate-900 border-t border-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-widest transition-colors"
          >
            Limpar Análise Individual
          </button>
        </Card>
      )}

      {viewMode === 'visual' ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="h-[400px]">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <span className="w-2 h-6 bg-emerald-500 rounded-full"></span>
                Faturamento x Custos por Veículo
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vehicleStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="placa" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#94a3b8" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                  <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                  <Bar dataKey="totalFrete" name="Frete (R$)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="totalCustos" name="Custos Var (R$)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="h-[400px]">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                Lucro Operacional por Placa
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={vehicleStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="placa" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#94a3b8" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                  <Bar dataKey="lucroOp" name="Lucro Op. (R$)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="totalFrete" name="Teto Frete" stroke="#94a3b8" strokeDasharray="5 5" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </div>
      ) : (
        <Card className="p-0 overflow-hidden border-slate-800 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-report">
              <thead className="bg-slate-950 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="p-4 border-b border-slate-800">Placa</th>
                  <th className="p-4 border-b border-slate-800 text-right">Frete Bruto</th>
                  <th className="p-4 border-b border-slate-800 text-right">Custos Var.</th>
                  <th className="p-4 border-b border-slate-800 text-right">Combustível</th>
                  <th className="p-4 border-b border-slate-800 text-right">Manutenção</th>
                  <th className="p-4 border-b border-slate-800 text-right">Equipe</th>
                  <th className="p-4 border-b border-slate-800 text-right">Lucro Op.</th>
                  <th className="p-4 border-b border-slate-800 text-center">Margem</th>
                </tr>
              </thead>
              <tbody>
                {vehicleStats.map((s) => (
                  <tr 
                    key={s.id} 
                    onClick={() => setSelectedVehicleId(s.id)}
                    className={`cursor-pointer transition-colors border-b border-slate-800/30 ${selectedVehicleId === s.id ? 'bg-blue-900/10' : 'hover:bg-slate-900/50'}`}
                  >
                    <td className="p-4">
                      <span className="bg-slate-950 px-2 py-1 rounded border border-slate-800 font-mono text-xs font-bold text-blue-400">
                        {s.placa}
                      </span>
                    </td>
                    <td className="p-4 text-right text-xs font-bold text-slate-300">
                      {s.totalFrete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 text-right text-xs font-bold text-red-400/80">
                      {s.totalCustos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 text-right text-[10px] text-slate-500">
                      {s.gastoCombustivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 text-right text-[10px] text-slate-500">
                      {s.gastoManutencao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 text-right text-[10px] text-slate-500">
                      {s.gastoEquipe.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`p-4 text-right text-xs font-black ${s.lucroOp >= 0 ? 'text-emerald-400' : 'text-red-500'}`}>
                      {s.lucroOp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 text-center">
                       <span className={`text-[10px] font-black px-2 py-1 rounded-full ${s.margem >= 20 ? 'bg-emerald-500/10 text-emerald-500' : s.margem > 0 ? 'bg-blue-500/10 text-blue-500' : 'bg-red-500/10 text-red-500'}`}>
                        {s.margem.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-950 font-bold border-t-2 border-slate-800">
                <tr>
                  <td className="p-4 text-[10px] uppercase text-slate-500">LUCRO REAL</td>
                  <td className="p-4 text-right text-sm text-blue-400">R$ {totals.frete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="p-4 text-right text-sm text-red-400">R$ {(totals.custos + totalDespesasFixas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td colSpan={3}></td>
                  <td className={`p-4 text-right text-sm ${totals.lucroLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>R$ {totals.lucroLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="p-4 text-center text-xs text-slate-400">
                    {totals.frete > 0 ? ((totals.lucroLiquido / totals.frete) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AdminVehicleReport;
