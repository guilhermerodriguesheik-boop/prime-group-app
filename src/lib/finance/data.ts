import { createClient } from "@/lib/supabase/server";

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getFinanceSnapshot() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const [
    workspaceResult,
    accountResult,
    transactionResult,
    payableResult,
    receivableResult,
    vehicleResult,
    tripResult,
    loanResult,
    counterpartyResult,
  ] = await Promise.all([
    supabase.from("workspaces").select("id,name,kind,currency").order("kind"),
    supabase.from("accounts").select("id,workspace_id,name,institution,account_type,opening_balance,active").eq("active", true).order("name"),
    supabase.from("transactions").select("id,workspace_id,account_id,vehicle_id,trip_id,type,amount,occurred_at,due_date,description,status,source").neq("status", "cancelled").order("occurred_at", { ascending: false }).limit(500),
    supabase.from("payables").select("id,workspace_id,description,amount,paid_amount,due_date,status").neq("status", "cancelled").order("due_date").limit(300),
    supabase.from("receivables").select("id,workspace_id,description,amount,received_amount,due_date,status").neq("status", "cancelled").order("due_date").limit(300),
    supabase.from("vehicles").select("id,workspace_id,nickname,plate,make,model,year,status,odometer_km,estimated_value").order("nickname"),
    supabase.from("trips").select("id,workspace_id,vehicle_id,reference,origin,destination,started_at,ended_at,distance_km,freight_revenue,status").order("started_at", { ascending: false }).limit(200),
    supabase.from("loans").select("id,workspace_id,counterparty_id,principal,periodic_rate,rate_period,interest_type,fixed_interest,start_date,status,maturity_date,direction").neq("status", "cancelled").limit(200),
    supabase.from("counterparties").select("id,workspace_id,name,document,phone,email,kind").order("name").limit(300),
  ]);

  const error = [
    workspaceResult.error,
    accountResult.error,
    transactionResult.error,
    payableResult.error,
    receivableResult.error,
    vehicleResult.error,
    tripResult.error,
    loanResult.error,
    counterpartyResult.error,
  ].find(Boolean);

  if (error) throw error;

  const workspaces = workspaceResult.data ?? [];
  const accounts = accountResult.data ?? [];
  const transactions = transactionResult.data ?? [];
  const payables = payableResult.data ?? [];
  const receivables = receivableResult.data ?? [];
  const vehicles = vehicleResult.data ?? [];
  const trips = tripResult.data ?? [];
  const loans = loanResult.data ?? [];
  const counterparties = counterpartyResult.data ?? [];

  const workspaceMap = new Map(workspaces.map((item) => [item.id, item]));
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const next30 = new Date(now);
  next30.setDate(next30.getDate() + 30);

  const posted = transactions.filter((item) => ["posted", "reconciled"].includes(item.status));
  const monthly = posted.filter((item) => {
    const date = new Date(item.occurred_at);
    return date >= monthStart && date < monthEnd;
  });

  const cash = accounts.reduce((sum, account) => sum + number(account.opening_balance), 0)
    + posted.reduce((sum, item) => {
      if (item.type === "income") return sum + number(item.amount);
      if (item.type === "expense") return sum - number(item.amount);
      return sum;
    }, 0);

  const openReceivables = receivables.filter((item) => ["open", "partial", "overdue"].includes(item.status));
  const openPayables = payables.filter((item) => ["open", "partial", "overdue"].includes(item.status));

  const receivableBalance = (item: (typeof openReceivables)[number]) => Math.max(0, number(item.amount) - number(item.received_amount));
  const payableBalance = (item: (typeof openPayables)[number]) => Math.max(0, number(item.amount) - number(item.paid_amount));

  const receivable30 = openReceivables
    .filter((item) => {
      const due = new Date(item.due_date + "T12:00:00");
      return due <= next30;
    })
    .reduce((sum, item) => sum + receivableBalance(item), 0);

  const payable30 = openPayables
    .filter((item) => {
      const due = new Date(item.due_date + "T12:00:00");
      return due <= next30;
    })
    .reduce((sum, item) => sum + payableBalance(item), 0);

  const overdueReceivables = openReceivables
    .filter((item) => new Date(item.due_date + "T23:59:59") < now)
    .reduce((sum, item) => sum + receivableBalance(item), 0);

  const overduePayables = openPayables
    .filter((item) => new Date(item.due_date + "T23:59:59") < now)
    .reduce((sum, item) => sum + payableBalance(item), 0);

  function totalsFor(kind: "prime" | "personal" | "interest") {
    const ids = new Set(workspaces.filter((item) => item.kind === kind).map((item) => item.id));
    const items = monthly.filter((item) => ids.has(item.workspace_id));
    const income = items.filter((item) => item.type === "income").reduce((sum, item) => sum + number(item.amount), 0);
    const expense = items.filter((item) => item.type === "expense").reduce((sum, item) => sum + number(item.amount), 0);
    const openIn = openReceivables.filter((item) => ids.has(item.workspace_id)).reduce((sum, item) => sum + receivableBalance(item), 0);
    const openOut = openPayables.filter((item) => ids.has(item.workspace_id)).reduce((sum, item) => sum + payableBalance(item), 0);
    return { income, expense, result: income - expense, openIn, openOut };
  }

  const vehicleResults = vehicles.map((vehicle) => {
    const items = monthly.filter((item) => item.vehicle_id === vehicle.id);
    const income = items.filter((item) => item.type === "income").reduce((sum, item) => sum + number(item.amount), 0);
    const expense = items.filter((item) => item.type === "expense").reduce((sum, item) => sum + number(item.amount), 0);
    const vehicleTrips = trips.filter((trip) => trip.vehicle_id === vehicle.id && trip.status === "completed");
    const distance = vehicleTrips.reduce((sum, trip) => sum + number(trip.distance_km), 0);
    return { ...vehicle, income, expense, profit: income - expense, distance };
  });

  return {
    user,
    workspaces,
    workspaceMap,
    accounts,
    transactions,
    payables,
    receivables,
    vehicles,
    trips,
    loans,
    counterparties,
    monthly,
    cash,
    receivable30,
    payable30,
    overdueReceivables,
    overduePayables,
    prime: totalsFor("prime"),
    personal: totalsFor("personal"),
    interest: totalsFor("interest"),
    vehicleResults,
  };
}
