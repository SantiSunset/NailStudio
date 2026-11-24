import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const app = document.querySelector("#app");

let supabase = null;
let session = null;
let supabaseConfigError = "";
let currentView = "agenda";
let business = null;
let membership = null;
let selectedAgendaUserId = "mine";
let calendarMonth = new Date();
let calendarView = "month";
let search = { clients: "", services: "", appointments: "" };
let data = { clients: [], services: [], appointments: [], memberships: [], expenses: [], messages: [], clientHistory: [] };

const icons = {
  agenda: "calendar-days",
  clients: "users",
  services: "sparkles",
  admins: "shield",
  settings: "settings",
  dashboard: "layout-dashboard",
  messages: "message-square-text",
  add: "plus",
  edit: "pencil",
  trash: "trash-2",
  save: "save",
  logout: "log-out",
  whatsapp: "message-circle",
};

const paymentMethods = [
  ["pix", "PIX"],
  ["debito", "Cartão débito"],
  ["credito", "Cartão crédito"],
  ["dinheiro", "Dinheiro"],
];

const statusOptions = ["confirmado", "concluido", "cancelado", "faltou"];
const userColors = ["#b94062", "#19776c", "#5941a9", "#b88216", "#1f6feb", "#c2410c", "#047857", "#be185d"];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function initSupabase() {
  const config = window.NAIL_AGENDA_SUPABASE || {};
  const url = String(config.url || "").trim().replace(/\/+$/, "");
  const anonKey = String(config.anonKey || "").trim();
  
  if (!url || !anonKey) {
    supabaseConfigError = "Arquivo de configuração do Supabase ausente.";
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("protocol");
    supabase = createClient(url, anonKey);
    supabaseConfigError = "";
    return true;
  } catch {
    supabase = null;
    supabaseConfigError = "Erro ao conectar com as credenciais do Supabase.";
    return false;
  }
}

function icon(name, size = 18) {
  return `<i data-lucide="${name}" style="width:${size}px;height:${size}px"></i>`;
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtShortDate(value) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function fromLocalInput(value) {
  return value ? new Date(value).toISOString() : null;
}

function addMinutes(dateString, minutes) {
  const date = new Date(dateString);
  date.setMinutes(date.getMinutes() + Number(minutes || 60));
  return date.toISOString();
}

function dateKey(date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function monthLabel(date) {
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function activeMembers() {
  return data.memberships.filter((item) => item.status === "active" && item.user_id);
}

function memberLabel(userId) {
  if (!userId) return "Sem profissional";
  const member = data.memberships.find((item) => item.user_id === userId);
  return member?.full_name || member?.email || "Profissional removida";
}

function memberColor(userId) {
  const members = activeMembers();
  const member = members.find((item) => item.user_id === userId);
  if (member?.color) return member.color;
  const index = Math.max(0, members.findIndex((item) => item.user_id === userId));
  return userColors[index % userColors.length];
}

function ownUserId() {
  return session?.user?.id;
}

function isOwner() {
  return membership?.role === "owner";
}

function canManageAdmins() {
  return isOwner();
}

function canViewAllAgendas() {
  return isOwner() || Boolean(membership?.can_view_all_agendas);
}

function currentAgendaUserId() {
  if (selectedAgendaUserId === "mine") return ownUserId();
  if (!canViewAllAgendas()) return ownUserId();
  return selectedAgendaUserId;
}

function findClient(id) {
  return data.clients.find((item) => item.id === id);
}

function findService(id) {
  return data.services.find((item) => item.id === id);
}

function paymentLabel(value) {
  return paymentMethods.find(([id]) => id === value)?.[1] || value || "";
}

function appointmentRevenue(item) {
  const storedPrice = Number(item.price || 0);
  return storedPrice > 0 ? storedPrice : Number(findService(item.service_id)?.price || 0);
}

function appointmentCost(item) {
  const storedCost = Number(item.cost || 0);
  return storedCost > 0 ? storedCost : Number(findService(item.service_id)?.cost || 0);
}

function visibleAppointments() {
  const userId = currentAgendaUserId();
  return filterAppointments(data.appointments.filter((item) => !userId || item.professional_id === userId));
}

function filterAppointments(base) {
  const term = search.appointments.trim().toLowerCase();
  if (!term) return base;
  return base.filter((item) => {
    const client = findClient(item.client_id);
    const service = findService(item.service_id);
    return [client?.name, client?.phone, service?.name, item.status, item.payment_method, item.notes]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });
}

function clientAppointments(clientId) {
  return data.appointments
    .filter((item) => item.client_id === clientId)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
}

function validFinancialAppointments() {
  return data.appointments.filter((item) => item.status === "confirmado" || item.status === "concluido");
}

function monthKeyFromDate(value) {
  return String(value).slice(0, 7);
}

function monthName(key) {
  return new Date(`${key}-02T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

function financeMonths() {
  const keys = new Set();
  validFinancialAppointments().forEach((item) => keys.add(monthKeyFromDate(item.starts_at)));
  data.expenses.forEach((item) => keys.add(item.expense_month));
  if (!keys.size) keys.add(dateKey(new Date()).slice(0, 7));
  return [...keys].sort();
}

function totalsForMonth(month) {
  const appointments = validFinancialAppointments().filter((item) => monthKeyFromDate(item.starts_at) === month);
  const revenue = appointments.reduce((sum, item) => sum + appointmentRevenue(item), 0);
  const serviceCosts = appointments.reduce((sum, item) => sum + appointmentCost(item), 0);
  const monthlyExpenses = data.expenses.filter((item) => item.expense_month === month).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return {
    revenue,
    serviceCosts,
    monthlyExpenses,
    expenses: serviceCosts + monthlyExpenses,
    profit: revenue - serviceCosts - monthlyExpenses,
  };
}

function paymentTotalsByMonth() {
  const result = {};
  validFinancialAppointments().forEach((item) => {
    const month = monthKeyFromDate(item.starts_at);
    result[month] ||= {};
    result[month][item.payment_method || "pix"] = (result[month][item.payment_method || "pix"] || 0) + appointmentRevenue(item);
  });
  return result;
}

function clientHistory(clientId) {
  return data.clientHistory
    .filter((item) => item.client_id === clientId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function clientStats(clientId) {
  const appointments = clientAppointments(clientId);
  const valid = appointments.filter((item) => item.status === "concluido" || item.status === "confirmado");
  const byYear = {};
  valid.forEach((item) => {
    const year = new Date(item.starts_at).getFullYear();
    byYear[year] = (byYear[year] || 0) + appointmentRevenue(item);
  });
  return {
    first: appointments[0]?.starts_at,
    count: valid.length,
    total: valid.reduce((sum, item) => sum + appointmentRevenue(item), 0),
    currentYearTotal: byYear[new Date().getFullYear()] || 0,
    byYear,
  };
}

function whatsappUrl(client) {
  const digits = String(client?.phone || "").replace(/\D/g, "");
  if (!digits) return "";
  const phone = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${phone}`;
}

async function main() {
  if (!initSupabase()) {
    renderAuth();
    return;
  }
  const { data: authData } = await supabase.auth.getSession();
  session = authData.session;
  supabase.auth.onAuthStateChange(async (_event, nextSession) => {
    session = nextSession;
    if (session) await bootApp();
    else renderAuth();
  });
  if (session) await bootApp();
  else renderAuth();
}

function renderAuth() {
  app.innerHTML = `
    <main class="auth-wrap">
      <section class="auth-card panel">
        <div class="auth-intro">
          <div>
            <div class="brand">
              <div class="brand-mark">N</div>
              <div>
                <h1>Agenda Nail Studio</h1>
                <span>Horários, clientes e serviços</span>
              </div>
            </div>
            <h1 style="margin-top:34px">Sua agenda pronta para o salão.</h1>
            <p>Faça login ou crie sua conta para gerenciar seus atendimentos por profissional, com permissões por administradora.</p>
          </div>
          ${supabaseConfigError ? `<div class="notice">${supabaseConfigError}</div>` : ''}
        </div>
        <div class="auth-content">
          <form class="form" id="auth-form">
            <h2>Entrar ou criar conta</h2>
            <label>Nome <input name="name" placeholder="Seu nome (apenas para criar conta)" /></label>
            <label>E-mail <input name="email" type="email" required /></label>
            <label>Senha <input name="password" type="password" minlength="6" required /></label>
            <div class="toolbar">
              <button class="btn" name="intent" value="login" type="submit">${icon("log-in")} Entrar</button>
              <button class="btn secondary" name="intent" value="signup" type="submit">${icon("user-plus")} Criar conta</button>
            </div>
          </form>
        </div>
      </section>
    </main>
  `;
  refreshIcons();
  document.querySelector("#auth-form").addEventListener("submit", handleAuth);
}

async function handleAuth(event) {
  event.preventDefault();
  if (!supabase && !initSupabase()) {
    toast("O arquivo de configuração do Supabase não foi carregado corretamente.");
    return;
  }
  const form = event.currentTarget;
  const clicked = event.submitter?.value || "login";
  const values = Object.fromEntries(new FormData(form));
  const result =
    clicked === "signup"
      ? await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: { data: { full_name: values.name || values.email } },
        })
      : await supabase.auth.signInWithPassword({ email: values.email, password: values.password });
  if (result.error) {
    toast(result.error.message);
    return;
  }
  if (clicked === "signup" && !result.data.session) {
    toast("Conta criada. Confirme o e-mail se o Supabase solicitar.");
  }
}

async function bootApp() {
  try {
    await ensureProfileAndBusiness();
    await loadAll();
    renderApp();
  } catch (error) {
    renderFatal(error);
  }
}

function renderFatal(error) {
  app.innerHTML = `
    <main class="auth-wrap">
      <section class="panel panel-pad" style="max-width:760px">
        <h2>Não consegui carregar a agenda</h2>
        <p class="muted">${escapeHtml(error.message || error)}</p>
        <div class="toolbar" style="margin-top:16px">
          <button class="btn secondary" id="back-auth">${icon("log-in")} Voltar ao Login</button>
          <button class="btn" id="try-again">${icon("refresh-cw")} Tentar novamente</button>
        </div>
      </section>
    </main>
  `;
  refreshIcons();
  document.querySelector("#back-auth").onclick = () => renderAuth();
  document.querySelector("#try-again").onclick = () => bootApp();
}

async function ensureProfileAndBusiness() {
  const user = session.user;
  const email = user.email.toLowerCase();
  const fullName = user.user_metadata?.full_name || email;
  await supabase.from("profiles").upsert({ id: user.id, full_name: fullName });

  const { data: invited } = await supabase.from("memberships").select("*").eq("email", email).limit(1).maybeSingle();
  if (invited && !invited.user_id) {
    await supabase.from("memberships").update({ user_id: user.id, status: "active", full_name: fullName }).eq("id", invited.id);
  }

  const { data: activeMembership } = await supabase
    .from("memberships")
    .select("*, businesses(*)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (activeMembership) {
    membership = activeMembership;
    business = activeMembership.businesses;
    return;
  }

  const { data: newBusiness, error: businessError } = await supabase
    .from("businesses")
    .insert({ name: "Meu Nail Studio", owner_id: user.id })
    .select()
    .single();
  if (businessError) throw businessError;

  const { data: ownerMembership, error: membershipError } = await supabase
    .from("memberships")
    .insert({
      business_id: newBusiness.id,
      user_id: user.id,
      email,
      full_name: fullName,
      role: "owner",
      status: "active",
      can_view_all_agendas: true,
    })
    .select()
    .single();
  if (membershipError) throw membershipError;
  business = newBusiness;
  membership = ownerMembership;
}

async function loadAll() {
  const businessId = business.id;
  const [clients, services, appointments, memberships, expenses, messages, clientHistoryRows] = await Promise.all([
    supabase.from("clients").select("*").eq("business_id", businessId).order("name"),
    supabase.from("services").select("*").eq("business_id", businessId).order("name"),
    supabase.from("appointments").select("*").eq("business_id", businessId).order("starts_at", { ascending: true }),
    supabase.from("memberships").select("*").eq("business_id", businessId).order("created_at"),
    supabase.from("monthly_expenses").select("*").eq("business_id", businessId).order("expense_month", { ascending: false }),
    supabase.from("message_templates").select("*").eq("business_id", businessId).order("title"),
    supabase.from("client_history").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
  ]);
  for (const result of [clients, services, appointments, memberships, expenses, messages, clientHistoryRows]) {
    if (result.error) throw result.error;
  }
  data = {
    clients: clients.data || [],
    services: services.data || [],
    appointments: appointments.data || [],
    memberships: memberships.data || [],
    expenses: expenses.data || [],
    messages: messages.data || [],
    clientHistory: clientHistoryRows.data || [],
  };
  membership = data.memberships.find((item) => item.user_id === ownUserId()) || membership;
  if (!canViewAllAgendas()) selectedAgendaUserId = "mine";
}

function renderApp() {
  const views = [
    ["dashboard", "Dashboard", icons.dashboard],
    ["agenda", "Agenda", icons.agenda],
    ["clients", "Clientes", icons.clients],
    ["services", "Serviços", icons.services],
    ["messages", "Mensagens", icons.messages],
    ["admins", "Admins", icons.admins],
    ["settings", "Ajustes", icons.settings],
  ];
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">N</div>
          <div>
            <h1>${escapeHtml(business.name)}</h1>
            <span>${escapeHtml(session.user.email)}</span>
          </div>
        </div>
        <nav class="nav">
          ${views
            .map(
              ([id, label, iconName]) => `
                <button class="${currentView === id ? "active" : ""}" data-view="${id}" title="${label}">
                  ${icon(iconName)} ${label}
                </button>
              `,
            )
            .join("")}
        </nav>
        <div class="sidebar-footer">
          <span>Perfil: ${escapeHtml(membership.role)}</span>
          <button class="sidebar-action" id="logout">${icon(icons.logout)} Sair</button>
        </div>
      </aside>
      <main class="main">${renderCurrentView()}</main>
    </div>
  `;
  refreshIcons();
  bindGlobalEvents();
  bindViewEvents();
}

function bindGlobalEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      currentView = button.dataset.view;
      renderApp();
    });
  });
  document.querySelector("#logout").addEventListener("click", () => supabase.auth.signOut());
}

function renderCurrentView() {
  if (currentView === "dashboard") return renderDashboard();
  if (currentView === "clients") return renderClients();
  if (currentView === "services") return renderServices();
  if (currentView === "messages") return renderMessages();
  if (currentView === "admins") return renderAdmins();
  if (currentView === "settings") return renderSettings();
  return renderAgenda();
}

function header(title, subtitle, action = "") {
  return `
    <div class="topbar">
      <div>
        <h2>${title}</h2>
        <p>${subtitle}</p>
      </div>
      <div class="toolbar">${action}</div>
    </div>
  `;
}

function renderDashboard() {
  const months = financeMonths();
  const totals = months.reduce(
    (acc, month) => {
      const item = totalsForMonth(month);
      acc.revenue += item.revenue;
      acc.expenses += item.expenses;
      acc.profit += item.profit;
      return acc;
    },
    { revenue: 0, expenses: 0, profit: 0 },
  );
  const maxValue = Math.max(...months.flatMap((month) => {
    const item = totalsForMonth(month);
    return [item.revenue, item.expenses, Math.abs(item.profit)];
  }), 1);
  const paymentTotals = paymentTotalsByMonth();

  return `
    ${header("Dashboard", "Receita, gastos, lucro e entrada por forma de pagamento.", `<button class="btn" data-new-expense>${icon(icons.add)} Gasto do mês</button>`)}
    <section class="grid three" style="margin-bottom:16px">
      <div class="stat"><span>Receita total</span><strong>${money.format(totals.revenue)}</strong></div>
      <div class="stat"><span>Gastos totais</span><strong>${money.format(totals.expenses)}</strong></div>
      <div class="stat"><span>Lucro total</span><strong>${money.format(totals.profit)}</strong></div>
    </section>
    <section class="panel panel-pad" style="margin-bottom:16px">
      <h3>Receita, gastos e lucro por mês</h3>
      <div class="chart-bars">
        ${months
          .map((month) => {
            const item = totalsForMonth(month);
            return `
              <div class="chart-row">
                <span>${escapeHtml(monthName(month))}</span>
                <div class="chart-track"><b class="bar revenue" style="width:${(item.revenue / maxValue) * 100}%"></b></div>
                <div class="chart-track"><b class="bar expense" style="width:${(item.expenses / maxValue) * 100}%"></b></div>
                <div class="chart-track"><b class="bar profit" style="width:${(Math.max(item.profit, 0) / maxValue) * 100}%"></b></div>
                <strong>${money.format(item.profit)}</strong>
              </div>
            `;
          })
          .join("")}
      </div>
      <div class="chart-legend"><span class="revenue"></span> Receita <span class="expense"></span> Gastos <span class="profit"></span> Lucro</div>
    </section>
    <section class="grid two">
      <div class="panel">${paymentTable(paymentTotals, months)}${paymentAnnualTable(paymentTotals)}</div>
      <div class="panel">${expenseTable()}</div>
    </section>
  `;
}

function paymentTable(paymentTotals, months) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Mês</th>${paymentMethods.map(([, label]) => `<th>${label}</th>`).join("")}<th>Total</th></tr></thead>
        <tbody>
          ${months
            .map((month) => {
              const total = paymentMethods.reduce((sum, [id]) => sum + Number(paymentTotals[month]?.[id] || 0), 0);
              return `
                <tr>
                  <td><strong>${escapeHtml(monthName(month))}</strong></td>
                  ${paymentMethods.map(([id]) => `<td>${money.format(Number(paymentTotals[month]?.[id] || 0))}</td>`).join("")}
                  <td>${money.format(total)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function paymentAnnualTable(paymentTotals) {
  const years = [...new Set(Object.keys(paymentTotals).map((month) => month.slice(0, 4)))].sort().reverse();
  if (!years.length) return "";
  return `
    <div class="table-wrap payment-annual">
      <table>
        <thead><tr><th>Ano</th>${paymentMethods.map(([, label]) => `<th>${label}</th>`).join("")}<th>Total</th></tr></thead>
        <tbody>
          ${years
            .map((year) => {
              const totals = Object.entries(paymentTotals)
                .filter(([month]) => month.startsWith(year))
                .reduce((acc, [, methods]) => {
                  paymentMethods.forEach(([id]) => {
                    acc[id] = (acc[id] || 0) + Number(methods[id] || 0);
                  });
                  return acc;
                }, {});
              const total = paymentMethods.reduce((sum, [id]) => sum + Number(totals[id] || 0), 0);
              return `<tr><td><strong>${year}</strong></td>${paymentMethods.map(([id]) => `<td>${money.format(Number(totals[id] || 0))}</td>`).join("")}<td>${money.format(total)}</td></tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function expenseTable() {
  if (!data.expenses.length) return `<div class="empty">Nenhum gasto mensal cadastrado.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Mês</th><th>Descrição</th><th>Valor</th><th></th></tr></thead>
        <tbody>
          ${data.expenses
            .map(
              (item) => `
                <tr>
                  <td>${escapeHtml(monthName(item.expense_month))}</td>
                  <td>${escapeHtml(item.description || "")}</td>
                  <td>${money.format(Number(item.amount || 0))}</td>
                  <td>
                    <div class="actions">
                      <button class="btn secondary icon" title="Editar" data-edit-expense="${item.id}">${icon(icons.edit)}</button>
                      <button class="btn danger icon" title="Remover" data-delete-expense="${item.id}">${icon(icons.trash)}</button>
                    </div>
                  </td>
                </tr>
              `,
            )
            .join("")}
          ${financeMonths()
            .map((month) => {
              const total = data.expenses.filter((item) => item.expense_month === month).reduce((sum, item) => sum + Number(item.amount || 0), 0);
              return `<tr class="expense-total"><td colspan="2">Total de gastos extras em ${escapeHtml(monthName(month))}</td><td><strong>${money.format(total)}</strong></td><td></td></tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAgenda() {
  const today = dateKey(new Date());
  const appointments = visibleAppointments();
  const upcoming = appointments.filter((item) => item.starts_at.slice(0, 10) >= today && item.status === "confirmado");
  const todayAppointments = appointments.filter((item) => item.starts_at.slice(0, 10) === today);
  const revenue = appointments
    .filter((item) => item.status === "concluido" || item.status === "confirmado")
    .reduce((sum, item) => sum + appointmentRevenue(item), 0);
  return `
    ${header("Agenda", "Clique em um dia para marcar horário e filtre por agenda quando tiver permissão.", `<button class="btn" data-new-appointment>${icon(icons.add)} Novo horário</button>`)}
    <section class="toolbar agenda-tools">
      ${agendaSelector()}
      <div class="segmented">
        ${["day", "week", "month"].map((mode) => `<button class="${calendarView === mode ? "active" : ""}" data-calendar-view="${mode}" type="button">${mode === "day" ? "Dia" : mode === "week" ? "Semana" : "Mês"}</button>`).join("")}
      </div>
      <label class="search-field">
        <input data-search="appointments" placeholder="Buscar horário, cliente, serviço..." value="${escapeHtml(search.appointments)}" />
        <button type="button" class="search-button" title="Buscar" data-run-search="appointments">${icon("search")}</button>
      </label>
    </section>
    <section class="grid three" style="margin-bottom:16px">
      <div class="stat"><span>Hoje</span><strong>${todayAppointments.length}</strong></div>
      <div class="stat"><span>Próximos confirmados</span><strong>${upcoming.length}</strong></div>
      <div class="stat"><span>Valor previsto</span><strong>${money.format(revenue)}</strong></div>
    </section>
    <section class="panel panel-pad calendar-panel">
      ${calendarHeader()}
      ${calendarView === "day" ? calendarDayView(canViewAllAgendas() ? filterAppointments(data.appointments) : appointments) : calendarView === "week" ? calendarWeekView(appointments) : calendarGrid(appointments)}
    </section>
    <section class="panel" style="margin-top:16px">${appointmentTable(appointments)}</section>
  `;
}

function agendaSelector() {
  if (!canViewAllAgendas()) return `<span class="pill ativo">Minha agenda</span>`;
  return `
    <label class="inline-label">Agenda
      <select id="agenda-user">
        ${activeMembers()
          .map((item) => `<option value="${item.user_id}" ${currentAgendaUserId() === item.user_id ? "selected" : ""}>${escapeHtml(item.full_name || item.email)}</option>`)
          .join("")}
      </select>
    </label>
  `;
}

function calendarHeader() {
  const label =
    calendarView === "day"
      ? calendarMonth.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
      : calendarView === "week"
        ? `Semana de ${calendarMonth.toLocaleDateString("pt-BR")}`
        : monthLabel(calendarMonth);
  return `
    <div class="calendar-top">
      <button class="btn secondary icon" title="Anterior" data-calendar-prev>${icon("chevron-left")}</button>
      <strong>${escapeHtml(label)}</strong>
      <button class="btn secondary icon" title="Próximo" data-calendar-next>${icon("chevron-right")}</button>
    </div>
  `;
}

function calendarDayView(appointments) {
  const key = dateKey(calendarMonth);
  const members = canViewAllAgendas() ? activeMembers() : activeMembers().filter((item) => item.user_id === ownUserId());
  return `
    <div class="day-board">
      ${members
        .map((member) => {
          const items = appointments
            .filter((item) => item.professional_id === member.user_id && item.starts_at.slice(0, 10) === key)
            .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
          return `
            <section class="day-column" style="--user-color:${memberColor(member.user_id)}">
              <header><span></span><strong>${escapeHtml(member.full_name || member.email)}</strong></header>
              ${
                items.length
                  ? items
                      .map((item) => {
                        const client = findClient(item.client_id);
                        const service = findService(item.service_id);
                        return `
                          <button class="appointment-card" data-edit-appointment="${item.id}" type="button">
                            <strong>${fmtDate(item.starts_at).slice(11)}</strong>
                            <span>${escapeHtml(client?.name || "Cliente")}</span>
                            <small>${escapeHtml(service?.name || "")} · ${money.format(appointmentRevenue(item))}</small>
                          </button>
                        `;
                      })
                      .join("")
                  : `<button class="empty-slot" data-calendar-day="${key}" type="button">Adicionar horário</button>`
              }
            </section>
          `;
        })
        .join("")}
    </div>
  `;
}

function calendarWeekView(appointments) {
  const start = new Date(calendarMonth);
  start.setDate(calendarMonth.getDate() - calendarMonth.getDay());
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  return `
    <div class="week-grid">
      ${days
        .map((day) => {
          const key = dateKey(day);
          const items = appointments.filter((item) => item.starts_at.slice(0, 10) === key);
          return `
            <button class="week-day" data-calendar-day="${key}" type="button">
              <strong>${day.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" })}</strong>
              ${items
                .slice(0, 5)
                .map((item) => `<small style="border-left-color:${memberColor(item.professional_id)}">${escapeHtml(findClient(item.client_id)?.name || "Cliente")}</small>`)
                .join("")}
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function calendarGrid(appointments) {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  const birthdays = data.clients.filter((client) => client.birth_date);
  return `
    <div class="calendar-weekdays">${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => `<span>${day}</span>`).join("")}</div>
    <div class="calendar-grid">
      ${days
        .map((day) => {
          const key = dateKey(day);
          const dayAppointments = appointments.filter((item) => item.starts_at.slice(0, 10) === key);
          const dayBirthdays = birthdays.filter((client) => {
            const [, birthdayMonth, birthdayDay] = client.birth_date.split("-");
            return Number(birthdayMonth) === day.getMonth() + 1 && Number(birthdayDay) === day.getDate();
          });
          return `
            <button class="calendar-day ${day.getMonth() !== month ? "outside" : ""}" data-calendar-day="${key}" type="button">
              <span class="day-number">${day.getDate()}</span>
              <span class="day-items">
                ${dayAppointments.slice(0, 3).map((item) => `<small style="border-left-color:${memberColor(item.professional_id)}">${escapeHtml(findClient(item.client_id)?.name || "Cliente")}</small>`).join("")}
                ${dayBirthdays.slice(0, 2).map((client) => `<small class="birthday">${icon("cake", 12)} ${escapeHtml(client.name)}</small>`).join("")}
                ${dayAppointments.length > 3 ? `<small>+${dayAppointments.length - 3} horários</small>` : ""}
              </span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function appointmentTable(items) {
  if (!items.length) return `<div class="empty">Nenhum horário encontrado.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Data</th><th>Cliente</th><th>Serviço</th><th>Profissional</th><th>Valor</th><th>Status</th><th>Pagamento</th><th></th></tr></thead>
        <tbody>
          ${items
            .map((item) => {
              const client = findClient(item.client_id);
              const service = findService(item.service_id);
              return `
                <tr>
                  <td>${fmtDate(item.starts_at)}</td>
                  <td>${escapeHtml(client?.name || "Cliente removida")}</td>
                  <td>${escapeHtml(service?.name || "Serviço removido")}</td>
                  <td>${escapeHtml(memberLabel(item.professional_id))}</td>
                  <td>${money.format(appointmentRevenue(item))}</td>
                  <td><span class="pill ${item.status}">${escapeHtml(item.status)}</span></td>
                  <td>${escapeHtml(paymentLabel(item.payment_method))}</td>
                  <td>
                    <div class="actions">
                      <button class="btn secondary icon" title="Editar" data-edit-appointment="${item.id}">${icon(icons.edit)}</button>
                      <button class="btn danger icon" title="Remover" data-delete-appointment="${item.id}">${icon(icons.trash)}</button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderClients() {
  const term = search.clients.trim().toLowerCase();
  const clients = term
    ? data.clients.filter((item) => [item.name, item.phone, item.email, item.notes].filter(Boolean).some((value) => value.toLowerCase().includes(term)))
    : data.clients;
  return `
    ${header("Clientes", "Veja histórico, aniversário e rendimento por cliente.", `<button class="btn" data-new-client>${icon(icons.add)} Nova cliente</button>`)}
    <section class="toolbar" style="margin-bottom:16px">
      <label class="search-field"><input data-search="clients" placeholder="Buscar cliente..." value="${escapeHtml(search.clients)}" /><button type="button" class="search-button" title="Buscar" data-run-search="clients">${icon("search")}</button></label>
    </section>
    <section class="panel">${clientTable(clients)}</section>
  `;
}

function clientTable(clients) {
  if (!clients.length) return `<div class="empty">Nenhuma cliente encontrada.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nome</th><th>Telefone</th><th>Aniversário</th><th>Cliente desde</th><th>Atendimentos</th><th>Rendeu no ano</th><th></th></tr></thead>
        <tbody>
          ${clients
            .map((item) => {
              const stats = clientStats(item.id);
              return `
                <tr>
                  <td><strong>${escapeHtml(item.name)}</strong><br><span class="muted">${escapeHtml(item.email || "")}</span></td>
                  <td>${escapeHtml(item.phone || "")}</td>
                  <td>${item.birth_date ? fmtShortDate(item.birth_date) : ""}</td>
                  <td>${stats.first ? fmtDate(stats.first) : fmtDate(item.created_at)}</td>
                  <td>${stats.count}</td>
                  <td>${money.format(stats.currentYearTotal)}</td>
                  <td>
                    <div class="actions">
                      <button class="btn secondary icon" title="Histórico" data-view-client="${item.id}">${icon("bar-chart-3")}</button>
                      <button class="btn secondary icon" title="Editar" data-edit-client="${item.id}">${icon(icons.edit)}</button>
                      <button class="btn danger icon" title="Remover" data-delete-client="${item.id}">${icon(icons.trash)}</button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderServices() {
  const term = search.services.trim().toLowerCase();
  const services = term
    ? data.services.filter((item) => [item.name, item.description].filter(Boolean).some((value) => value.toLowerCase().includes(term)))
    : data.services;
  return `
    ${header("Serviços", "Defina preço, gasto e lucro de cada serviço.", `<button class="btn" data-new-service>${icon(icons.add)} Novo serviço</button>`)}
    <section class="toolbar" style="margin-bottom:16px">
      <label class="search-field"><input data-search="services" placeholder="Buscar serviço..." value="${escapeHtml(search.services)}" /><button type="button" class="search-button" title="Buscar" data-run-search="services">${icon("search")}</button></label>
    </section>
    <section class="panel">${serviceTable(services)}</section>
  `;
}

function serviceTable(services) {
  if (!services.length) return `<div class="empty">Nenhum serviço encontrado.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nome</th><th>Duração</th><th>Preço</th><th>Gasto</th><th>Lucro</th><th>Status</th><th>Descrição</th><th></th></tr></thead>
        <tbody>
          ${services
            .map((item) => {
              const price = Number(item.price || 0);
              const cost = Number(item.cost || 0);
              return `
                <tr>
                  <td><strong>${escapeHtml(item.name)}</strong></td>
                  <td>${item.duration_minutes} min</td>
                  <td>${money.format(price)}</td>
                  <td>${money.format(cost)}</td>
                  <td>${money.format(price - cost)}</td>
                  <td><span class="pill ${item.active ? "ativo" : "inativo"}">${item.active ? "ativo" : "inativo"}</span></td>
                  <td>${escapeHtml(item.description || "")}</td>
                  <td>
                    <div class="actions">
                      <button class="btn secondary icon" title="Editar" data-edit-service="${item.id}">${icon(icons.edit)}</button>
                      <button class="btn danger icon" title="Remover" data-delete-service="${item.id}">${icon(icons.trash)}</button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMessages() {
  return `
    ${header("Mensagens", "Crie modelos prontos para usar no contato com clientes.", `<button class="btn" data-new-message>${icon(icons.add)} Nova mensagem</button>`)}
    <section class="panel">${messageTable()}</section>
  `;
}

function messageTable() {
  if (!data.messages.length) return `<div class="empty">Nenhuma mensagem pré-definida cadastrada.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Título para admin</th><th>Mensagem personalizada</th><th></th></tr></thead>
        <tbody>
          ${data.messages
            .map(
              (item) => `
                <tr>
                  <td><strong>${escapeHtml(item.title)}</strong></td>
                  <td>${escapeHtml(item.body || "")}</td>
                  <td>
                    <div class="actions">
                      <button class="btn secondary icon" title="Editar" data-edit-message="${item.id}">${icon(icons.edit)}</button>
                      <button class="btn danger icon" title="Remover" data-delete-message="${item.id}">${icon(icons.trash)}</button>
                    </div>
                  </td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAdmins() {
  const action = canManageAdmins() ? `<button class="btn" data-new-admin>${icon(icons.add)} Convidar admin</button>` : "";
  return `
    ${header("Admins", "O administrador principal controla quem pode ver agendas alheias.", action)}
    <section class="panel">${adminTable()}</section>
  `;
}

function adminTable() {
  if (!data.memberships.length) return `<div class="empty">Nenhum admin cadastrado.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Cor</th><th>Função</th><th>Acesso a agendas</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${data.memberships
            .map(
              (item) => `
                <tr>
                  <td>${escapeHtml(item.full_name || "")}</td>
                  <td><strong>${escapeHtml(item.email)}</strong></td>
                  <td><span class="color-dot" style="background:${memberColor(item.user_id)}"></span></td>
                  <td><span class="pill ${item.role}">${escapeHtml(item.role)}</span></td>
                  <td>${item.role === "owner" || item.can_view_all_agendas ? "Pode ver todas" : "Somente a própria"}</td>
                  <td>${escapeHtml(item.status)}</td>
                  <td>
                    <div class="actions">
                      ${
                        canManageAdmins() && item.role !== "owner"
                          ? `<button class="btn secondary icon" title="Editar" data-edit-admin="${item.id}">${icon(icons.edit)}</button>
                             <button class="btn danger icon" title="Remover" data-delete-admin="${item.id}">${icon(icons.trash)}</button>`
                          : ""
                      }
                    </div>
                  </td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSettings() {
  return `
    ${header("Ajustes", "Nome do salão.")}
    <section class="grid two">
      <form class="panel panel-pad form" id="business-form">
        <h3>Salão</h3>
        <label>Nome do salão <input name="name" value="${escapeHtml(business.name)}" required /></label>
        <button class="btn" type="submit">${icon(icons.save)} Salvar salão</button>
      </form>
    </section>
  `;
}

function bindViewEvents() {
  document.querySelectorAll("[data-search]").forEach((input) => {
    input.addEventListener("input", (event) => {
      search[event.currentTarget.dataset.search] = event.currentTarget.value;
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        renderApp();
      }
    });
  });
  document.querySelectorAll("[data-run-search]").forEach((button) => {
    button.addEventListener("click", () => {
      renderApp();
    });
  });
  document.querySelector("#agenda-user")?.addEventListener("change", (event) => {
    selectedAgendaUserId = event.currentTarget.value;
    renderApp();
  });
  document.querySelectorAll("[data-calendar-view]").forEach((button) => {
    button.addEventListener("click", () => {
      calendarView = button.dataset.calendarView;
      renderApp();
    });
  });
  document.querySelector("[data-calendar-prev]")?.addEventListener("click", () => {
    const step = calendarView === "day" ? -1 : calendarView === "week" ? -7 : -1;
    calendarMonth =
      calendarView === "month"
        ? new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
        : new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), calendarMonth.getDate() + step);
    renderApp();
  });
  document.querySelector("[data-calendar-next]")?.addEventListener("click", () => {
    const step = calendarView === "day" ? 1 : calendarView === "week" ? 7 : 1;
    calendarMonth =
      calendarView === "month"
        ? new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
        : new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), calendarMonth.getDate() + step);
    renderApp();
  });
  document.querySelectorAll("[data-calendar-day]").forEach((button) => {
    button.addEventListener("click", () => openAppointmentForm(null, button.dataset.calendarDay));
  });

  document.querySelector("[data-new-appointment]")?.addEventListener("click", () => openAppointmentForm());
  document.querySelectorAll("[data-edit-appointment]").forEach((button) =>
    button.addEventListener("click", () => openAppointmentForm(data.appointments.find((item) => item.id === button.dataset.editAppointment))),
  );
  document.querySelectorAll("[data-delete-appointment]").forEach((button) =>
    button.addEventListener("click", () => removeRow("appointments", button.dataset.deleteAppointment)),
  );

  document.querySelector("[data-new-expense]")?.addEventListener("click", () => openExpenseForm());
  document.querySelectorAll("[data-edit-expense]").forEach((button) =>
    button.addEventListener("click", () => openExpenseForm(data.expenses.find((item) => item.id === button.dataset.editExpense))),
  );
  document.querySelectorAll("[data-delete-expense]").forEach((button) =>
    button.addEventListener("click", () => removeRow("monthly_expenses", button.dataset.deleteExpense)),
  );

  document.querySelector("[data-new-client]")?.addEventListener("click", () => openClientForm());
  document.querySelectorAll("[data-view-client]").forEach((button) =>
    button.addEventListener("click", () => openClientHistory(data.clients.find((item) => item.id === button.dataset.viewClient))),
  );
  document.querySelectorAll("[data-edit-client]").forEach((button) =>
    button.addEventListener("click", () => openClientForm(data.clients.find((item) => item.id === button.dataset.editClient))),
  );
  document.querySelectorAll("[data-delete-client]").forEach((button) =>
    button.addEventListener("click", () => removeRow("clients", button.dataset.deleteClient)),
  );

  document.querySelector("[data-new-service]")?.addEventListener("click", () => openServiceForm());
  document.querySelectorAll("[data-edit-service]").forEach((button) =>
    button.addEventListener("click", () => openServiceForm(data.services.find((item) => item.id === button.dataset.editService))),
  );
  document.querySelectorAll("[data-delete-service]").forEach((button) =>
    button.addEventListener("click", () => removeRow("services", button.dataset.deleteService)),
  );

  document.querySelector("[data-new-message]")?.addEventListener("click", () => openMessageForm());
  document.querySelectorAll("[data-edit-message]").forEach((button) =>
    button.addEventListener("click", () => openMessageForm(data.messages.find((item) => item.id === button.dataset.editMessage))),
  );
  document.querySelectorAll("[data-delete-message]").forEach((button) =>
    button.addEventListener("click", () => removeRow("message_templates", button.dataset.deleteMessage)),
  );

  document.querySelector("[data-new-admin]")?.addEventListener("click", () => openAdminForm());
  document.querySelectorAll("[data-edit-admin]").forEach((button) =>
    button.addEventListener("click", () => openAdminForm(data.memberships.find((item) => item.id === button.dataset.editAdmin))),
  );
  document.querySelectorAll("[data-delete-admin]").forEach((button) =>
    button.addEventListener("click", () => removeRow("memberships", button.dataset.deleteAdmin)),
  );

  document.querySelector("#business-form")?.addEventListener("submit", saveBusiness);
}

function modal(title, body, width = 780) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(25,21,18,.54);z-index:10;display:grid;place-items:center;padding:18px";
  overlay.innerHTML = `
    <section class="panel panel-pad" style="width:min(${width}px,100%);max-height:90vh;overflow:auto">
      <div class="topbar" style="margin-bottom:14px">
        <h2>${title}</h2>
        <button class="btn secondary icon" title="Fechar" data-close>${icon("x")}</button>
      </div>
      ${body}
    </section>
  `;
  document.body.appendChild(overlay);
  refreshIcons();
  overlay.querySelector("[data-close]").onclick = () => overlay.remove();
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.remove();
  });
  return overlay;
}

function openExpenseForm(item = null) {
  const overlay = modal(
    item ? "Editar gasto do mês" : "Novo gasto do mês",
    `
      <form class="form" id="expense-form">
        <label>Mês <input name="expense_month" type="month" value="${escapeHtml(item?.expense_month || dateKey(new Date()).slice(0, 7))}" required /></label>
        <label>Descrição <input name="description" value="${escapeHtml(item?.description)}" placeholder="Aluguel, materiais, anúncios..." required /></label>
        <label>Valor <input name="amount" type="number" min="0" step="0.01" value="${item?.amount || 0}" required /></label>
        <button class="btn" type="submit">${icon(icons.save)} Salvar</button>
      </form>
    `,
  );
  overlay.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await upsertRow(
      "monthly_expenses",
      { business_id: business.id, expense_month: values.expense_month, description: values.description, amount: Number(values.amount || 0) },
      item?.id,
    );
    overlay.remove();
  });
}

function openMessageForm(item = null) {
  const overlay = modal(
    item ? "Editar mensagem" : "Nova mensagem",
    `
      <form class="form" id="message-form">
        <label>Título para admin <input name="title" value="${escapeHtml(item?.title)}" required /></label>
        <label>Mensagem personalizada <textarea name="body" required>${escapeHtml(item?.body)}</textarea></label>
        <button class="btn" type="submit">${icon(icons.save)} Salvar</button>
      </form>
    `,
  );
  overlay.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await upsertRow("message_templates", { business_id: business.id, title: values.title, body: values.body }, item?.id);
    overlay.remove();
  });
}

function openClientForm(item = null) {
  const overlay = modal(
    item ? "Editar cliente" : "Nova cliente",
    `
      <form class="form" id="client-form">
        <label>Nome <input name="name" value="${escapeHtml(item?.name)}" required /></label>
        <div class="form-row">
          <label>Telefone <input name="phone" value="${escapeHtml(item?.phone)}" /></label>
          <label>E-mail <input name="email" type="email" value="${escapeHtml(item?.email)}" /></label>
        </div>
        <label>Data de aniversário <input name="birth_date" type="date" value="${escapeHtml(item?.birth_date)}" /></label>
        <label>Assuntos do atendimento <textarea name="service_subjects" placeholder="Preferências, assuntos conversados, cuidados, detalhes importantes...">${escapeHtml(item?.service_subjects)}</textarea></label>
        <label>Observações da cliente <textarea name="notes">${escapeHtml(item?.notes)}</textarea></label>
        <button class="btn" type="submit">${icon(icons.save)} Salvar</button>
      </form>
    `,
  );
  overlay.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const saved = await upsertRow("clients", { ...values, birth_date: values.birth_date || null, business_id: business.id }, item?.id);
    const clientId = item?.id || saved?.id;
    if (clientId && values.service_subjects?.trim() && values.service_subjects !== item?.service_subjects) {
      await addClientHistory(clientId, "Assuntos do atendimento", values.service_subjects);
      await loadAll();
      renderApp();
    }
    overlay.remove();
  });
}

function openClientHistory(client) {
  if (!client) return;
  const stats = clientStats(client.id);
  const years = Object.entries(stats.byYear).sort(([a], [b]) => Number(b) - Number(a));
  const appointments = clientAppointments(client.id);
  const notes = clientHistory(client.id);
  modal(
    `Histórico de ${escapeHtml(client.name)}`,
    `
      <section class="grid three" style="margin-bottom:16px">
        <div class="stat"><span>Cliente desde</span><strong>${stats.first ? fmtDate(stats.first) : fmtDate(client.created_at)}</strong></div>
        <div class="stat"><span>Atendimentos</span><strong>${stats.count}</strong></div>
        <div class="stat"><span>Total rendido</span><strong>${money.format(stats.total)}</strong></div>
      </section>
      <div class="history-layout">
        <div class="panel panel-pad no-shadow">
          <h3>Rendimento por ano</h3>
          ${years.length ? years.map(([year, total]) => `<p><strong>${year}</strong>: ${money.format(total)}</p>`).join("") : `<p class="muted">Sem rendimento registrado.</p>`}
        </div>
        <div class="panel panel-pad no-shadow">
          <h3>Atendimentos</h3>
          ${
            appointments.length
              ? appointments
                  .map((item) => `<p><strong>${fmtDate(item.starts_at)}</strong><br>${escapeHtml(findService(item.service_id)?.name || "")} · ${money.format(appointmentRevenue(item))} · ${escapeHtml(item.status)}</p>`)
                  .join("")
              : `<p class="muted">Nenhum atendimento registrado.</p>`
          }
        </div>
        <div class="panel panel-pad no-shadow">
          <h3>Histórico da cliente</h3>
          ${client.service_subjects ? `<p><strong>Assuntos do atendimento</strong><br>${escapeHtml(client.service_subjects)}</p>` : ""}
          ${
            notes.length
              ? notes.map((item) => `<p><strong>${escapeHtml(item.title)}</strong><br><span class="muted">${fmtDate(item.created_at)}</span><br>${escapeHtml(item.body)}</p>`).join("")
              : `<p class="muted">Sem observações vinculadas à cliente.</p>`
          }
        </div>
      </div>
    `,
    920,
  );
}

function openServiceForm(item = null) {
  const overlay = modal(
    item ? "Editar serviço" : "Novo serviço",
    `
      <form class="form" id="service-form">
        <label>Nome <input name="name" value="${escapeHtml(item?.name)}" required /></label>
        <div class="form-row">
          <label>Duração em minutos <input name="duration_minutes" type="number" min="1" value="${item?.duration_minutes || 60}" required /></label>
          <label>Preço <input name="price" type="number" min="0" step="0.01" value="${item?.price || 0}" required /></label>
        </div>
        <div class="form-row">
          <label>Gasto do serviço <input name="cost" type="number" min="0" step="0.01" value="${item?.cost || 0}" /></label>
          <label>Status
            <select name="active">
              <option value="true" ${item?.active !== false ? "selected" : ""}>Ativo</option>
              <option value="false" ${item?.active === false ? "selected" : ""}>Inativo</option>
            </select>
          </label>
        </div>
        <label>Descrição <textarea name="description">${escapeHtml(item?.description)}</textarea></label>
        <button class="btn" type="submit">${icon(icons.save)} Salvar</button>
      </form>
    `,
  );
  overlay.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    values.active = values.active === "true";
    values.duration_minutes = Number(values.duration_minutes);
    values.price = Number(values.price);
    values.cost = Number(values.cost || 0);
    await upsertRow("services", { ...values, business_id: business.id }, item?.id);
    overlay.remove();
  });
}

function openAppointmentForm(item = null, day = null) {
  if (!data.clients.length || !data.services.length) {
    toast("Cadastre pelo menos uma cliente e um serviço antes de marcar horário.");
    return;
  }
  const selectedService = findService(item?.service_id) || data.services.find((service) => service.active) || data.services[0];
  const client = findClient(item?.client_id) || data.clients[0];
  const startsValue = item?.starts_at ? toLocalInput(item.starts_at) : `${day || dateKey(new Date())}T09:00`;
  const price = item ? appointmentRevenue(item) : selectedService?.price ?? 0;
  const cost = item ? appointmentCost(item) : selectedService?.cost ?? 0;
  const professionalId = item?.professional_id || currentAgendaUserId() || ownUserId();
  const history = client ? clientAppointments(client.id).filter((historyItem) => historyItem.id !== item?.id).slice(-5).reverse() : [];
  const whatsUrl = item ? whatsappUrl(client) : "";
  const overlay = modal(
    item ? "Editar agendamento" : "Novo agendamento",
    `
      <form class="form" id="appointment-form">
        <div class="form-row">
          <label>Cliente
            <select name="client_id" required>${data.clients.map((entry) => `<option value="${entry.id}" ${entry.id === client?.id ? "selected" : ""}>${escapeHtml(entry.name)}</option>`).join("")}</select>
          </label>
          <label>Serviço
            <select name="service_id" required>
              ${data.services
                .filter((service) => service.active || service.id === item?.service_id)
                .map((service) => `<option value="${service.id}" ${service.id === selectedService.id ? "selected" : ""}>${escapeHtml(service.name)}</option>`)
                .join("")}
            </select>
          </label>
        </div>
        <div class="form-row">
          <label>Profissional / agenda
            <select name="professional_id" ${canViewAllAgendas() ? "" : "disabled"}>
              ${activeMembers().map((member) => `<option value="${member.user_id}" ${member.user_id === professionalId ? "selected" : ""}>${escapeHtml(member.full_name || member.email)}</option>`).join("")}
            </select>
          </label>
          <label>Data e hora <input name="starts_at" type="datetime-local" value="${startsValue}" required /></label>
        </div>
        <div class="form-row">
          <label>Valor cobrado <input name="price" type="number" min="0" step="0.01" value="${price}" required /></label>
          <label>Gasto do atendimento <input name="cost" type="number" min="0" step="0.01" value="${cost}" /></label>
        </div>
        <div class="form-row">
          <label>Forma de pagamento
            <select name="payment_method" required>${paymentMethods.map(([id, label]) => `<option value="${id}" ${id === (item?.payment_method || "pix") ? "selected" : ""}>${label}</option>`).join("")}</select>
          </label>
          <label>Status
            <select name="status">${statusOptions.map((status) => `<option value="${status}" ${status === (item?.status || "confirmado") ? "selected" : ""}>${status}</option>`).join("")}</select>
          </label>
        </div>
        <label>Observações do agendamento <textarea name="notes">${escapeHtml(item?.notes)}</textarea></label>
        <label>Observação para o histórico da cliente <textarea name="client_history_note" placeholder="Essa observação fica vinculada à cliente.">${escapeHtml(item?.client_history_note)}</textarea></label>
        <section class="panel panel-pad no-shadow">
          <h3>Histórico da cliente</h3>
          ${
            history.length
              ? history.map((entry) => `<p><strong>${fmtDate(entry.starts_at)}</strong> · ${escapeHtml(findService(entry.service_id)?.name || "")} · ${money.format(appointmentRevenue(entry))}</p>`).join("")
              : `<p class="muted">Sem atendimentos anteriores.</p>`
          }
        </section>
        <div class="toolbar">
          <button class="btn" type="submit">${icon(icons.save)} Salvar</button>
          ${whatsUrl ? `<a class="btn secondary" href="${whatsUrl}" target="_blank" rel="noopener">${icon(icons.whatsapp)} WhatsApp da cliente</a>` : ""}
        </div>
      </form>
    `,
    920,
  );
  overlay.querySelector("select[name='service_id']").addEventListener("change", (event) => {
    const service = findService(event.currentTarget.value);
    overlay.querySelector("input[name='price']").value = service?.price || 0;
    overlay.querySelector("input[name='cost']").value = service?.cost || 0;
  });
  overlay.querySelector("select[name='client_id']").addEventListener("change", () => {
    toast("Ao salvar ou reabrir, o histórico será atualizado para a cliente selecionada.");
  });
  overlay.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const service = findService(values.service_id);
    const startsAt = fromLocalInput(values.starts_at);
    const selectedProfessional = form.elements.professional_id?.value || ownUserId();
    const saved = await upsertRow(
      "appointments",
      {
        business_id: business.id,
        client_id: values.client_id,
        service_id: values.service_id,
        professional_id: selectedProfessional,
        starts_at: startsAt,
        ends_at: addMinutes(startsAt, service?.duration_minutes || 60),
        status: values.status,
        payment_method: values.payment_method,
        price: Number(values.price || 0),
        cost: Number(values.cost || 0),
        notes: values.notes,
        client_history_note: values.client_history_note,
      },
      item?.id,
    );
    if (saved && values.client_history_note?.trim() && values.client_history_note !== item?.client_history_note) {
      await addClientHistory(values.client_id, "Observação do agendamento", values.client_history_note);
      await loadAll();
      renderApp();
    }
    overlay.remove();
  });
}

function openAdminForm(item = null) {
  const overlay = modal(
    item ? "Editar admin" : "Convidar admin",
    `
      <form class="form" id="admin-form">
        <label>Nome <input name="full_name" value="${escapeHtml(item?.full_name)}" /></label>
        <label>E-mail <input name="email" type="email" value="${escapeHtml(item?.email)}" ${item ? "readonly" : ""} required /></label>
        <div class="form-row">
          <label>Cor da agenda <input name="color" type="color" value="${escapeHtml(item?.color || memberColor(item?.user_id))}" /></label>
          <label>Função
            <select name="role">
              <option value="admin" ${item?.role === "admin" ? "selected" : ""}>Admin</option>
              <option value="professional" ${item?.role === "professional" ? "selected" : ""}>Profissional</option>
            </select>
          </label>
          <label>Acesso a agendas alheias
            <select name="can_view_all_agendas">
              <option value="false" ${!item?.can_view_all_agendas ? "selected" : ""}>Somente própria</option>
              <option value="true" ${item?.can_view_all_agendas ? "selected" : ""}>Pode ver todas</option>
            </select>
          </label>
        </div>
        <button class="btn" type="submit">${icon(icons.save)} Salvar</button>
      </form>
    `,
  );
  overlay.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await upsertRow(
      "memberships",
      {
        business_id: business.id,
        full_name: values.full_name,
        email: values.email.toLowerCase(),
        role: values.role,
        status: item?.status || "invited",
        user_id: item?.user_id || null,
        can_view_all_agendas: values.can_view_all_agendas === "true",
        color: values.color,
      },
      item?.id,
    );
    overlay.remove();
    toast("Admin salvo. Se for convite, a pessoa deve criar conta com esse e-mail.");
  });
}

async function upsertRow(table, values, id) {
  const result = id
    ? await supabase.from(table).update(values).eq("id", id).select().maybeSingle()
    : await supabase.from(table).insert(values).select().maybeSingle();
  if (result.error) {
    toast(result.error.message);
    return null;
  }
  await loadAll();
  renderApp();
  toast("Salvo com sucesso.");
  return result.data;
}

async function addClientHistory(clientId, title, body) {
  if (!clientId || !body?.trim()) return;
  const { error } = await supabase.from("client_history").insert({
    business_id: business.id,
    client_id: clientId,
    title,
    body,
    created_by: ownUserId(),
  });
  if (error) toast(error.message);
}

async function removeRow(table, id) {
  if (!confirm("Remover este registro?")) return;
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) {
    toast(error.message);
    return;
  }
  await loadAll();
  renderApp();
  toast("Registro removido.");
}

async function saveBusiness(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const { error } = await supabase.from("businesses").update({ name: values.name }).eq("id", business.id);
  if (error) {
    toast(error.message);
    return;
  }
  business.name = values.name;
  renderApp();
  toast("Salão atualizado.");
}

main();