
import React, { useMemo } from 'react';
import { Fueling, MaintenanceRequest, Vehicle, FuelingStatus, FixedExpense } from '../types';
import { Card, Badge } from '../components/UI';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface AdminDashboardProps {
  fuelings: Fueling[];
  maintenances: MaintenanceRequest[];
  vehicles: Vehicle[];
  fixedExpenses: FixedExpense[];
  onBack: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ fuelings, maintenances, vehicles, fixedExpenses, onBack }) => {
  const stats = useMemo(() => {
    const totalFuelApproved = fuelings
      .filter(f => f.status === FuelingStatus.APROVADO)
      .reduce((sum, f) => sum + f.valor, 0);
    
    const totalFixed = fixedExpenses.reduce((sum, e) => sum + e.valor, 0);

    const vehicleStatus = {
      rodando: vehicles.filter(v => v.status === 'rodando').length,
      manutencao: vehicles.filter(v => v.status === 'manutencao').length,
      parado: vehicles.filter(v => v.status === 'parado').length,
    };

    return { totalFuelApproved, totalFixed, vehicleStatus };
  }, [fuelings, vehicles, fixedExpenses]);

  const chartData = [
    { name: 'Rodando', value: stats.vehicleStatus.rodando, color: '#10b981' },
    { name: 'Manutenção', value: stats.vehicleStatus.manutencao, color: '#f59e0b' },
    { name: 'Parado', value: stats.vehicleStatus.parado, color: '#ef4444' },
  ];

  const financialMix = [
    { name: 'Combustível', value: stats.totalFuelApproved, color: '#3b82f6' },
    { name: 'Custos Fixos', value: stats.totalFixed, color: '#6366f1' },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Dashboard Admin</h2>
        <button onClick={onBack} className="text-slate-500 hover:text-slate-200">Voltar</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-emerald-900/10 border-emerald-900/40">
          <div className="text-sm font-bold text-emerald-500 uppercase mb-1">Combustível (Aprovado)</div>
          <div className="text-3xl font-black">R$ {stats.totalFuelApproved.toLocaleString()}</div>
        </Card>
        <Card className="bg-indigo-900/10 border-indigo-900/40">
          <div className="text-sm font-bold text-indigo-500 uppercase mb-1">Custos Fixos Estruturais</div>
          <div className="text-3xl font-black">R$ {stats.totalFixed.toLocaleString()}</div>
        </Card>
        <Card className="bg-blue-900/10 border-blue-900/40">
          <div className="text-sm font-bold text-blue-500 uppercase mb-1">Manutenções Ativas</div>
          <div className="text-3xl font-black">{maintenances.filter(m => m.status !== 'feita' && m.status !== 'reprovada').length}</div>
        </Card>
        <Card className="bg-slate-900/50">
          <div className="text-sm font-bold text-slate-500 uppercase mb-1">Frota Total</div>
          <div className="text-3xl font-black">{vehicles.length} veículos</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <span className="w-2 h-6 bg-blue-600 rounded-full"></span>
            Mix de Custos (Globais)
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={financialMix}
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {financialMix.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `R$ ${value.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-6 mt-4">
              {financialMix.map(item => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="text-xs text-slate-400 font-bold uppercase">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <span className="w-2 h-6 bg-blue-600 rounded-full"></span>
            Status da Frota
          </h3>
          <div className="h-80 w-full flex flex-col items-center">
            <ResponsiveContainer width="100%" height="80%">
              <PieChart>
                <Pie
                  data={chartData}
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-6 mt-4">
              {chartData.map(item => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="text-xs text-slate-400 font-bold uppercase">{item.name}: {item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
