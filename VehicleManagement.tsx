
import React from 'react';
import { RouteDeparture } from '../types';
import { Card, Badge } from '../components/UI';

interface MyRoutesProps {
  routes: RouteDeparture[];
  onBack: () => void;
}

const MyRoutes: React.FC<MyRoutesProps> = ({ routes, onBack }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Minhas Saídas</h2>
        <button onClick={onBack} className="text-slate-500 hover:text-slate-200">Voltar</button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {routes.length === 0 && <p className="text-slate-600 py-10 text-center">Nenhuma rota registrada</p>}
        {routes.map(r => (
          <Card key={r.id}>
            <div className="flex justify-between mb-4">
              <span className="bg-slate-950 px-2 py-1 rounded text-xs font-mono font-bold text-blue-400">{r.placa}</span>
              <Badge status={r.status}>{r.status}</Badge>
            </div>
            <div className="flex items-center gap-4 text-sm mb-4">
              <div className="flex-1">
                <div className="text-slate-500 text-[10px] uppercase font-bold">Origem</div>
                {/* Replaced non-existent r.origem with static 'Sede' */}
                <div className="text-slate-200 font-medium">Sede</div>
              </div>
              <div className="text-slate-700">→</div>
              <div className="flex-1">
                <div className="text-slate-500 text-[10px] uppercase font-bold">Destino</div>
                <div className="text-slate-200 font-medium">{r.destino}</div>
              </div>
            </div>
            <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">{new Date(r.createdAt).toLocaleString()}</div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default MyRoutes;
