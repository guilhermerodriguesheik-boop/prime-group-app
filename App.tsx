
import React, { useState, useEffect } from 'react';
import { User, UserSession, UserRole, Fueling, MaintenanceRequest, RouteDeparture, Vehicle, DailyRoute, Toll, Customer, FixedExpense, AgregadoFreight, Agregado, FuelingStatus, MaintenanceStatus, RouteStatus, FinanceiroStatus } from './types';
import { INITIAL_USERS, INITIAL_VEHICLES, INITIAL_CUSTOMERS } from './constants';
import { Logo } from './components/UI';

// Imports de Páginas
import Login from './pages/Login';
import VehicleSelection from './pages/VehicleSelection';
import OperationHome from './pages/OperationHome';
import FuelingForm from './pages/FuelingForm';
import MaintenanceForm from './pages/MaintenanceForm';
import RouteForm from './pages/RouteForm';
import MyRequests from './pages/MyRequests';
import MyRoutes from './pages/MyRoutes';
import AdminDashboard from './pages/AdminDashboard';
import AdminPending from './pages/AdminPending';
import UserManagement from './pages/UserManagement';
import VehicleManagement from './pages/VehicleManagement';
import TechnicalDocs from './pages/TechnicalDocs';
import DriverDailyRoute from './pages/DriverDailyRoute';
import AdminMaintenanceHistory from './pages/AdminMaintenanceHistory';
import AdminPreventiveMaintenance from './pages/AdminPreventiveMaintenance';
import AdminVehicleReport from './pages/AdminVehicleReport';
import AdminActivityReport from './pages/AdminActivityReport';
import AdminCreateDailyRoute from './pages/AdminCreateDailyRoute';
import AdminTollManagement from './pages/AdminTollManagement';
import AdminCustomerManagement from './pages/AdminCustomerManagement';
import AdminChecklistReport from './pages/AdminChecklistReport';
import AdminFixedExpenses from './pages/AdminFixedExpenses';
import AdminAgregadoFreight from './pages/AdminAgregadoFreight';
import AdminAgregadoReport from './pages/AdminAgregadoReport';
import AdminAgregadoManagement from './pages/AdminAgregadoManagement';
import AdminConsolidatedFinancialReport from './pages/AdminConsolidatedFinancialReport';
import AdminTracking from './pages/AdminTracking';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [session, setSession] = useState<UserSession | null>(null);
  const [currentPage, setCurrentPage] = useState<string>('login');
  
  // Estado com persistência (tentar carregar do localStorage ou usar iniciais)
  const [users, setUsers] = useState<User[]>(() => JSON.parse(localStorage.getItem('prime_users') || JSON.stringify(INITIAL_USERS)));
  const [vehicles, setVehicles] = useState<Vehicle[]>(() => JSON.parse(localStorage.getItem('prime_vehicles') || JSON.stringify(INITIAL_VEHICLES)));
  const [customers, setCustomers] = useState<Customer[]>(() => JSON.parse(localStorage.getItem('prime_customers') || JSON.stringify(INITIAL_CUSTOMERS)));
  const [agregados, setAgregados] = useState<Agregado[]>(() => JSON.parse(localStorage.getItem('prime_agregados') || '[]'));
  const [fuelings, setFuelings] = useState<Fueling[]>(() => JSON.parse(localStorage.getItem('prime_fuelings') || '[]'));
  const [maintenances, setMaintenances] = useState<MaintenanceRequest[]>(() => JSON.parse(localStorage.getItem('prime_maintenances') || '[]'));
  const [routes, setRoutes] = useState<RouteDeparture[]>(() => JSON.parse(localStorage.getItem('prime_routes') || '[]'));
  const [dailyRoutes, setDailyRoutes] = useState<DailyRoute[]>(() => JSON.parse(localStorage.getItem('prime_daily_routes') || '[]'));
  const [tolls, setTolls] = useState<Toll[]>(() => JSON.parse(localStorage.getItem('prime_tolls') || '[]'));
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>(() => JSON.parse(localStorage.getItem('prime_fixed_expenses') || '[]'));
  const [agregadoFreights, setAgregadoFreights] = useState<AgregadoFreight[]>(() => JSON.parse(localStorage.getItem('prime_agregado_freights') || '[]'));

  // Efeito para salvar no localStorage sempre que houver mudança
  useEffect(() => {
    localStorage.setItem('prime_users', JSON.stringify(users));
    localStorage.setItem('prime_vehicles', JSON.stringify(vehicles));
    localStorage.setItem('prime_customers', JSON.stringify(customers));
    localStorage.setItem('prime_agregados', JSON.stringify(agregados));
    localStorage.setItem('prime_fuelings', JSON.stringify(fuelings));
    localStorage.setItem('prime_maintenances', JSON.stringify(maintenances));
    localStorage.setItem('prime_routes', JSON.stringify(routes));
    localStorage.setItem('prime_daily_routes', JSON.stringify(dailyRoutes));
    localStorage.setItem('prime_tolls', JSON.stringify(tolls));
    localStorage.setItem('prime_fixed_expenses', JSON.stringify(fixedExpenses));
    localStorage.setItem('prime_agregado_freights', JSON.stringify(agregadoFreights));
  }, [users, vehicles, customers, agregados, fuelings, maintenances, routes, dailyRoutes, tolls, fixedExpenses, agregadoFreights]);

  useEffect(() => {
    const savedUserId = localStorage.getItem('prime_group_user_id');
    const savedSession = localStorage.getItem('prime_group_session');
    
    if (savedUserId) {
      const user = users.find(u => u.id === savedUserId);
      if (user && user.ativo) {
        setCurrentUser(user);
        if (savedSession) setSession(JSON.parse(savedSession));
        setCurrentPage('operation');
      }
    }
  }, [users]);

  const navigate = (page: string) => {
    if (!currentUser) {
      setCurrentPage('login');
      return;
    }
    setCurrentPage(page);
    window.scrollTo(0, 0);
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('prime_group_user_id', user.id);
    navigate('operation');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSession(null);
    localStorage.removeItem('prime_group_user_id');
    localStorage.removeItem('prime_group_session');
    navigate('login');
  };

  // Handlers Genéricos de Atualização
  const updateList = (setFn: any, id: string, update: any) => {
    setFn((prev: any[]) => prev.map(item => item.id === id ? { ...item, ...update } : item));
  };

  const renderPage = () => {
    if (!currentUser) return <Login onLogin={handleLogin} users={users} />;

    // Bloqueio de tela operacional se não tiver placa (exceto admin)
    const isAnyAdmin = currentUser.perfil === UserRole.ADMIN || currentUser.perfil === UserRole.CUSTOM_ADMIN;
    const isOperational = currentUser.perfil === UserRole.MOTORISTA || currentUser.perfil === UserRole.AJUDANTE;
    const restrictedPages = ['fueling', 'maintenance', 'route', 'daily-route'];
    
    if (isOperational && restrictedPages.includes(currentPage) && !session) {
      return <VehicleSelection vehicles={vehicles} onSelect={(vId, pl) => {
        const s = { userId: currentUser.id, vehicleId: vId, placa: pl, updatedAt: new Date().toISOString() };
        setSession(s); localStorage.setItem('prime_group_session', JSON.stringify(s)); navigate('operation');
      }} onBack={() => navigate('operation')} />;
    }

    switch (currentPage) {
      case 'select-vehicle':
        return <VehicleSelection vehicles={vehicles} onSelect={(vId, pl) => {
          const s = { userId: currentUser.id, vehicleId: vId, placa: pl, updatedAt: new Date().toISOString() };
          setSession(s); localStorage.setItem('prime_group_session', JSON.stringify(s)); navigate('operation');
        }} onBack={() => navigate('operation')} />;

      // MOTORISTA
      case 'fueling':
        return <FuelingForm session={session!} user={currentUser} onBack={() => navigate('operation')} onSubmit={(f) => { setFuelings([f, ...fuelings]); navigate('operation'); }} />;
      case 'maintenance':
        return <MaintenanceForm session={session!} user={currentUser} onBack={() => navigate('operation')} onSubmit={(m) => { setMaintenances([m, ...maintenances]); navigate('operation'); }} />;
      case 'daily-route':
        return <DriverDailyRoute session={session!} user={currentUser} customers={customers} onBack={() => navigate('operation')} onSubmit={(dr) => { setDailyRoutes([dr, ...dailyRoutes]); navigate('operation'); }} />;
      case 'my-requests':
        return <MyRequests fuelings={fuelings.filter(f => f.motoristaId === currentUser.id)} maintenances={maintenances.filter(m => m.motoristaId === currentUser.id)} onBack={() => navigate('operation')} />;

      // AJUDANTE
      case 'route':
        return <RouteForm session={session!} user={currentUser} drivers={users.filter(u => u.perfil === UserRole.MOTORISTA)} customers={customers} onBack={() => navigate('operation')} onSubmit={(r) => { setRoutes([r, ...routes]); navigate('operation'); }} />;
      case 'my-routes':
        return <MyRoutes routes={routes.filter(r => r.ajudanteId === currentUser.id)} onBack={() => navigate('operation')} />;

      // ADMIN
      case 'admin-dashboard':
        return <AdminDashboard fuelings={fuelings} maintenances={maintenances} vehicles={vehicles} fixedExpenses={fixedExpenses} onBack={() => navigate('operation')} />;
      case 'admin-pending':
        return <AdminPending 
          fuelings={fuelings} maintenances={maintenances} dailyRoutes={dailyRoutes} routes={routes} vehicles={vehicles} users={users} currentUser={currentUser}
          onUpdateFueling={(id, up) => updateList(setFuelings, id, up)}
          onUpdateMaintenance={(id, up) => updateList(setMaintenances, id, up)}
          onUpdateDailyRoute={(id, up) => updateList(setDailyRoutes, id, up)}
          onUpdateRoute={(id, up) => updateList(setRoutes, id, up)}
          onBack={() => navigate('operation')} 
        />;
      case 'user-mgmt':
        return <UserManagement users={users} setUsers={setUsers} onBack={() => navigate('operation')} />;
      case 'vehicle-mgmt':
        return <VehicleManagement vehicles={vehicles} setVehicles={setVehicles} onBack={() => navigate('operation')} />;
      case 'admin-tracking':
        return <AdminTracking vehicles={vehicles} onUpdateVehicle={(id, up) => updateList(setVehicles, id, up)} onBack={() => navigate('operation')} />;
      case 'admin-checklists':
        return <AdminChecklistReport dailyRoutes={dailyRoutes} users={users} vehicles={vehicles} onBack={() => navigate('operation')} />;
      case 'admin-create-route':
        return <AdminCreateDailyRoute users={users} vehicles={vehicles} customers={customers} onBack={() => navigate('operation')} onSubmit={(dr) => { setDailyRoutes([dr, ...dailyRoutes]); navigate('operation'); }} />;
      case 'admin-agregado-freight':
        return <AdminAgregadoFreight agregados={agregados} onBack={() => navigate('operation')} onSubmit={(af) => setAgregadoFreights([af, ...agregadoFreights])} />;
      case 'admin-tolls':
        return <AdminTollManagement tolls={tolls} vehicles={vehicles} onUpdateTolls={setTolls} onBack={() => navigate('operation')} />;
      case 'admin-consolidated-finance':
        return <AdminConsolidatedFinancialReport dailyRoutes={dailyRoutes} routes={routes} fuelings={fuelings} maintenances={maintenances} tolls={tolls} agregadoFreights={agregadoFreights} fixedExpenses={fixedExpenses} onBack={() => navigate('operation')} />;
      case 'admin-vehicle-report':
        return <AdminVehicleReport fuelings={fuelings} maintenances={maintenances} vehicles={vehicles} dailyRoutes={dailyRoutes} routes={routes} tolls={tolls} fixedExpenses={fixedExpenses} onBack={() => navigate('operation')} onUpdateDailyRoute={(id, up) => updateList(setDailyRoutes, id, up)} onUpdateRoute={(id, up) => updateList(setRoutes, id, up)} />;
      case 'admin-agregado-report':
        return <AdminAgregadoReport freights={agregadoFreights} onBack={() => navigate('operation')} />;
      case 'admin-activity-report':
        return <AdminActivityReport 
          dailyRoutes={dailyRoutes} routes={routes} fuelings={fuelings} maintenances={maintenances} users={users}
          onUpdateDailyRoute={(id, up) => updateList(setDailyRoutes, id, up)}
          onUpdateRoute={(id, up) => updateList(setRoutes, id, up)}
          onUpdateFueling={(id, up) => updateList(setFuelings, id, up)}
          onUpdateMaintenance={(id, up) => updateList(setMaintenances, id, up)}
          onBack={() => navigate('operation')} 
        />;
      case 'admin-fixed-expenses':
        return <AdminFixedExpenses fixedExpenses={fixedExpenses} onUpdateExpenses={setFixedExpenses} onBack={() => navigate('operation')} />;
      case 'admin-preventive':
        return <AdminPreventiveMaintenance vehicles={vehicles} onUpdateVehicle={(id, up) => updateList(setVehicles, id, up)} onBack={() => navigate('operation')} />;
      case 'admin-maintenance-history':
        return <AdminMaintenanceHistory maintenances={maintenances} users={users} onBack={() => navigate('operation')} />;
      case 'admin-agregado-mgmt':
        return <AdminAgregadoManagement agregados={agregados} onUpdateAgregados={setAgregados} onBack={() => navigate('operation')} />;
      case 'admin-customers':
        return <AdminCustomerManagement customers={customers} setCustomers={setCustomers} onBack={() => navigate('operation')} />;
      case 'tech-docs':
        return <TechnicalDocs onBack={() => navigate('operation')} />;

      default:
        return <OperationHome user={currentUser} session={session} onNavigate={navigate} onLogout={handleLogout} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-50">
      <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-50 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('operation')}>
          <Logo size="sm" showText={true} />
        </div>
        {currentUser && (
          <div className="flex items-center gap-4">
            <div className="hidden md:block text-right">
              <div className="text-xs font-bold text-white uppercase">{currentUser.nome}</div>
              <div className="text-[10px] text-blue-500 font-black uppercase tracking-widest">{currentUser.perfil}</div>
            </div>
            <button onClick={handleLogout} className="bg-red-900/30 text-red-400 px-3 py-1.5 rounded-lg text-xs font-black uppercase border border-red-900/20 hover:bg-red-900/50 transition-all">Sair</button>
          </div>
        )}
      </header>
      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full">
        {renderPage()}
      </main>
    </div>
  );
};

export default App;
