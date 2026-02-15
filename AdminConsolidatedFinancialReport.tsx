
import React, { useState, useMemo } from 'react';
import { AgregadoFreight } from '../types';
import { Card, Input, Select } from '../components/UI';

interface AdminAgregadoReportProps {
  freights: AgregadoFreight[];
  onBack: () => void;
}

const AdminAgregadoReport: React.FC<AdminAgregadoReportProps> = ({ freights, onBack }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPlaca, setSelectedPlaca] = useState('');

  // Get unique plates from the freights list for the filter
  const placaOptions = useMemo(() => {
    const plates = Array.from(new Set(freights.map(f => f.placa))).sort();
    return plates.map(p => ({ label: p, value: p }));
  }, [freights]);

  const filteredFreights = useMemo(() => {
    let result = freights;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter(f => {
        const d = new Date(f.data);
        return d >= start && d <= end;
      });
    }

    if (selectedPlaca) {
      result = result.filter(f => f.placa === selectedPlaca);
    }

    return result;
  }, [freights, startDate, endDate, selectedPlaca]);

  const totals = useMemo(() => {
    return filteredFreights.reduce((acc, curr) => ({
      frete: acc.frete + curr.valorFrete,
      pago: acc.pago + curr.valorAgregado,
      saldo: acc.saldo + (curr.valorFrete - curr.valorAgregado)
    }), { frete: 0, pago: 0, saldo: 0 });
  }, [filteredFreights]);

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Relatório de Agregados</h2>
          <p className="text-slate-500 text-sm">Gestão financeira de fretes terceirizados</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-xl font-bold border border-blue-600 text-xs">
            🖨️ PDF / Imprimir
          </button>
          <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl font-bold border border-slate-700 text-xs">
            Voltar
          </button>
        </div>
      </div>

      <Card className="border-indigo-900/30 no-print">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label="Data Início" type="date" value={startDate} onChange={setStartDate} />
          <Input label="Data Fim" type="date" value={endDate} onChange={setEndDate} />
          <Select 
            label="Filtrar por Placa" 
            value={selectedPlaca} 
            onChange={setSelectedPlaca} 
            options={placaOptions} 
          />
        </div>
        {(startDate || endDate || selectedPlaca) && (
          <div className="mt-2 flex justify-end">
            <button 
              onClick={() => { setStartDate(''); setEndDate(''); setSelectedPlaca(''); }}
              className="text-[10px] font-black uppercase text-red-400 hover:text-red-300 transition-colors"
            >
              Limpar Filtros
            </button>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-slate-900/50 border-slate-800 text-center">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Fretes (Receita)</div>
          <div className="text-2xl font-black text-white">R$ {totals.frete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </Card>
        <Card className="bg-red-900/10 border-red-900/40 text-center">
          <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">Total Pago (Agregados)</div>
          <div className="text-2xl font-black text-white">R$ {totals.pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </Card>
        <Card className={`${totals.saldo >= 0 ? 'bg-emerald-900/10 border-emerald-900/40' : 'bg-red-900/20 border-red-900/50'} text-center`}>
          <div className={`text-[10px] font-black ${totals.saldo >= 0 ? 'text-emerald-500' : 'text-red-500'} uppercase tracking-widest mb-1`}>Saldo Líquido (Margem)</div>
          <div className={`text-2xl font-black ${totals.saldo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>R$ {totals.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden border-slate-800 shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-report">
            <thead className="bg-slate-950 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <tr>
                <th className="p-4 border-b border-slate-800">Data</th>
                <th className="p-4 border-b border-slate-800">Placa</th>
                <th className="p-4 border-b border-slate-800">Agregado</th>
                <th className="p-4 border-b border-slate-800">OC</th>
                <th className="p-4 border-b border-slate-800 text-right">Frete Bruto</th>
                <th className="p-4 border-b border-slate-800 text-right">Pago Agregado</th>
                <th className="p-4 border-b border-slate-800 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {filteredFreights.map((f) => {
                const saldo = f.valorFrete - f.valorAgregado;
                return (
                  <tr key={f.id} className="hover:bg-slate-900/50 transition-colors border-b border-slate-800/30">
                    <td className="p-4 text-xs font-mono text-slate-400">
                      {new Date(f.data).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-4">
                      <span className="bg-slate-950 px-2 py-1 rounded border border-slate-800 font-mono text-xs font-bold text-blue-400">
                        {f.placa}
                      </span>
                    </td>
                    <td className="p-4 text-xs font-bold text-slate-200">
                      {f.nomeAgregado}
                    </td>
                    <td className="p-4 text-[10px] font-mono text-slate-500">
                      {f.oc}
                    </td>
                    <td className="p-4 text-right text-xs font-bold text-slate-300">
                      {f.valorFrete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 text-right text-xs font-bold text-red-400/80">
                      {f.valorAgregado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`p-4 text-right text-xs font-black ${saldo >= 0 ? 'text-emerald-400' : 'text-red-500'}`}>
                      {saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
              {filteredFreights.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-600 italic">Nenhum frete encontrado para os filtros selecionados.</td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-950 font-bold border-t-2 border-slate-800">
              <tr>
                <td colSpan={4} className="p-4 text-[10px] uppercase text-slate-500">TOTAIS</td>
                <td className="p-4 text-right text-sm text-blue-400">R$ {totals.frete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className="p-4 text-right text-sm text-red-400">R$ {totals.pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className={`p-4 text-right text-sm ${totals.saldo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>R$ {totals.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default AdminAgregadoReport;
