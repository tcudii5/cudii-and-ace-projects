/* Cudii & Ace — Project HQ */
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const money = (n) => "$" + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const configured =
    window.SUPABASE_URL && window.SUPABASE_URL.startsWith("http") &&
    window.SUPABASE_ANON_KEY && window.SUPABASE_ANON_KEY.length > 20;

  const sb = configured
    ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null;

  /* ---------- storage: Supabase when configured, else this device ---------- */
  const LS_KEY = "cae.localdb";
  const uid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));
  const lsLoad = () => {
    try {
      return Object.assign(
        { projects: [], tasks: [], costs: [], messages: [] },
        JSON.parse(localStorage.getItem(LS_KEY) || "{}")
      );
    } catch {
      return { projects: [], tasks: [], costs: [], messages: [] };
    }
  };
  const lsSave = (d) => localStorage.setItem(LS_KEY, JSON.stringify(d));

  const db = {
    async loadAll() {
      if (sb) {
        const [p, t, c, m] = await Promise.all([
          sb.from("projects").select("*").order("created_at", { ascending: true }),
          sb.from("tasks").select("*").order("created_at", { ascending: true }),
          sb.from("costs").select("*").order("created_at", { ascending: true }),
          sb.from("messages").select("*").order("created_at", { ascending: true }).limit(500),
        ]);
        return { projects: p.data || [], tasks: t.data || [], costs: c.data || [], messages: m.data || [] };
      }
      return lsLoad();
    },
    async insert(table, row) {
      if (sb) return void (await sb.from(table).insert(row));
      const d = lsLoad();
      d[table].push(Object.assign({ id: uid(), created_at: new Date().toISOString() }, row));
      lsSave(d);
    },
    async update(table, id, patch) {
      if (sb) return void (await sb.from(table).update(patch).eq("id", id));
      const d = lsLoad();
      const r = d[table].find((x) => x.id === id);
      if (r) Object.assign(r, patch);
      lsSave(d);
    },
    async remove(table, id) {
      if (sb) return void (await sb.from(table).delete().eq("id", id));
      const d = lsLoad();
      d[table] = d[table].filter((x) => x.id !== id);
      if (table === "projects") {
        d.tasks = d.tasks.filter((t) => t.project_id !== id);
        d.costs = d.costs.filter((c) => c.project_id !== id);
      }
      lsSave(d);
    },
  };

  const state = {
    who: localStorage.getItem("cae.who") || "",
    projects: [], tasks: [], costs: [], messages: [],
    openProjectId: null,
    lastSeenChat: Number(localStorage.getItem("cae.lastSeenChat") || 0),
  };

  /* ---------- setup ---------- */
  function showSetup() {
    $("#setup").hidden = false;
    $("#main").hidden = true;
    $("#conn-warn").hidden = configured;
    $$(".who").forEach((b) => {
      b.classList.toggle("selected", b.dataset.who === state.who);
      b.onclick = () => {
        state.who = b.dataset.who;
        $$(".who").forEach((x) => x.classList.toggle("selected", x === b));
        $("#setup-done").disabled = false;
      };
    });
    $("#setup-done").disabled = !state.who;
    $("#setup-done").onclick = () => {
      localStorage.setItem("cae.who", state.who);
      start();
    };
  }

  /* ---------- nav ---------- */
  function go(view) {
    $$("#main .view").forEach((v) => (v.hidden = true));
    $("#view-" + view).hidden = false;
    $$("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.nav === view));
    if (view === "chat") markChatSeen();
    if (view === "projects") renderProjects();
    if (view === "me") $("#me-name").textContent = state.who;
  }

  /* ---------- data load ---------- */
  async function loadAll() {
    const d = await db.loadAll();
    state.projects = d.projects;
    state.tasks = d.tasks;
    state.costs = d.costs;
    state.messages = d.messages;
    renderProjects();
    renderDetail();
    renderChat();
  }

  function projectTotals(id) {
    const cost = state.costs.filter((c) => c.project_id === id).reduce((s, c) => s + Number(c.amount || 0), 0);
    const tasks = state.tasks.filter((t) => t.project_id === id);
    const open = tasks.filter((t) => !t.done).length;
    return { cost, open, taskCount: tasks.length };
  }

  const statusClass = (s) => "s-" + String(s || "Lead").replace(/\s+/g, "");

  /* ---------- projects list ---------- */
  function renderProjects() {
    const list = $("#project-list");
    list.innerHTML = "";
    $("#projects-empty").hidden = state.projects.length > 0;
    $("#project-count").textContent = state.projects.length;

    let portfolio = 0;
    for (const proj of state.projects) {
      const { cost, open, taskCount } = projectTotals(proj.id);
      portfolio += cost;
      const pct = taskCount ? Math.round(((taskCount - open) / taskCount) * 100) : 0;
      const sc = statusClass(proj.status);
      const el = document.createElement("div");
      el.className = "row tap " + sc;
      el.innerHTML =
        `<div class="grow">
           <div class="title">${esc(proj.name)}</div>
           <div class="sub">${esc(proj.client || "No client")} · ${open}/${taskCount} to do</div>
           <div class="progress"><span style="width:${pct}%"></span></div>
         </div>
         <span class="pill ${sc}">${esc(proj.status)}</span>
         <span class="amt">${money(cost)}</span>`;
      el.onclick = () => openProject(proj.id);
      list.appendChild(el);
    }

    const pt = $("#portfolio-total");
    pt.hidden = state.projects.length === 0;
    $("#portfolio-value").textContent = money(portfolio);
  }

  /* ---------- project detail ---------- */
  function openProject(id) {
    state.openProjectId = id;
    renderDetail();
    go("detail");
  }

  function currentProject() {
    return state.projects.find((p) => p.id === state.openProjectId);
  }

  function renderDetail() {
    const proj = currentProject();
    if (!proj) return;
    $("#detail-name").value = proj.name;
    $("#detail-client").value = proj.client || "";
    $("#detail-status").value = proj.status || "Lead";
    const { cost, open, taskCount } = projectTotals(proj.id);
    $("#detail-total").textContent = money(cost);
    $("#detail-open").textContent = open;
    $("#detail-progress").style.width =
      (taskCount ? Math.round(((taskCount - open) / taskCount) * 100) : 0) + "%";

    const tl = $("#task-list");
    tl.innerHTML = "";
    for (const t of state.tasks.filter((t) => t.project_id === proj.id)) {
      const el = document.createElement("div");
      el.className = "row" + (t.done ? " task-done" : "");
      el.innerHTML =
        `<button class="task-check${t.done ? " done" : ""}" aria-label="toggle">${t.done ? "✓" : ""}</button>
         <div class="grow title">${esc(t.title)}</div>
         <button class="icon-btn" aria-label="delete">✕</button>`;
      el.querySelector(".task-check").onclick = () =>
        db.update("tasks", t.id, { done: !t.done }).then(loadAll);
      el.querySelector(".icon-btn").onclick = () =>
        db.remove("tasks", t.id).then(loadAll);
      tl.appendChild(el);
    }

    const cl = $("#cost-list");
    cl.innerHTML = "";
    for (const c of state.costs.filter((c) => c.project_id === proj.id)) {
      const el = document.createElement("div");
      el.className = "row";
      el.innerHTML =
        `<div class="grow title">${esc(c.label)}</div>
         <span class="amt">${money(c.amount)}</span>
         <button class="icon-btn" aria-label="delete">✕</button>`;
      el.querySelector(".icon-btn").onclick = () =>
        db.remove("costs", c.id).then(loadAll);
      cl.appendChild(el);
    }
  }

  function saveProjectFields() {
    const proj = currentProject();
    if (!proj) return;
    const patch = {
      name: $("#detail-name").value.trim() || "Untitled",
      client: $("#detail-client").value.trim(),
      status: $("#detail-status").value,
    };
    db.update("projects", proj.id, patch).then(loadAll);
  }

  /* ---------- chat ---------- */
  function renderChat() {
    const log = $("#chat-log");
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.innerHTML = "";
    for (const m of state.messages) {
      const el = document.createElement("div");
      el.className = "msg" + (m.author === state.who ? " mine" : "");
      const time = new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      el.innerHTML = `<span class="who">${esc(m.author)}<span class="time">${time}</span></span>${esc(m.body)}`;
      log.appendChild(el);
    }
    if (atBottom || !$("#view-chat").hidden) log.scrollTop = log.scrollHeight;
    updateChatBadge();
  }

  function updateChatBadge() {
    const unseen = state.messages.filter(
      (m) => m.author !== state.who && new Date(m.created_at).getTime() > state.lastSeenChat
    ).length;
    const badge = $("#chat-badge");
    badge.hidden = unseen === 0 || !$("#view-chat").hidden;
    badge.textContent = unseen;
  }

  function markChatSeen() {
    state.lastSeenChat = Date.now();
    localStorage.setItem("cae.lastSeenChat", state.lastSeenChat);
    updateChatBadge();
  }

  /* ---------- realtime ---------- */
  function subscribe() {
    if (!sb) return;
    sb.channel("cae-all")
      .on("postgres_changes", { event: "*", schema: "public" }, (payload) => {
        if (payload.table === "messages") {
          loadAll();
        } else {
          loadAll();
        }
      })
      .subscribe();
  }

  /* ---------- wire up ---------- */
  function wire() {
    $$("#nav button").forEach((b) => (b.onclick = () => go(b.dataset.nav)));
    $("#back").onclick = () => go("projects");

    $("#add-project").onclick = async () => {
      const name = $("#new-project").value.trim();
      if (!name) return;
      $("#new-project").value = "";
      await db.insert("projects", { name, client: "", status: "Lead" });
      loadAll();
    };
    $("#new-project").addEventListener("keydown", (e) => e.key === "Enter" && $("#add-project").click());

    $("#detail-name").addEventListener("change", saveProjectFields);
    $("#detail-client").addEventListener("change", saveProjectFields);
    $("#detail-status").addEventListener("change", saveProjectFields);

    $("#add-task").onclick = async () => {
      const title = $("#new-task").value.trim();
      if (!title || !state.openProjectId) return;
      $("#new-task").value = "";
      await db.insert("tasks", { title, project_id: state.openProjectId, done: false });
      loadAll();
    };
    $("#new-task").addEventListener("keydown", (e) => e.key === "Enter" && $("#add-task").click());

    $("#add-cost").onclick = async () => {
      const label = $("#cost-label").value.trim();
      const amount = parseFloat($("#cost-amount").value);
      if (!label || isNaN(amount) || !state.openProjectId) return;
      $("#cost-label").value = "";
      $("#cost-amount").value = "";
      await db.insert("costs", { label, amount, project_id: state.openProjectId });
      loadAll();
    };

    $("#delete-project").onclick = async () => {
      if (!state.openProjectId) return;
      if (!confirm("Delete this project and all its tasks and costs?")) return;
      await db.remove("projects", state.openProjectId);
      state.openProjectId = null;
      loadAll();
      go("projects");
    };

    $("#chat-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = $("#chat-input").value.trim();
      if (!body) return;
      $("#chat-input").value = "";
      await db.insert("messages", { author: state.who, body });
      markChatSeen();
      loadAll();
    });

    $("#switch-who").onclick = () => {
      localStorage.removeItem("cae.who");
      state.who = "";
      showSetup();
    };
  }

  /* ---------- boot ---------- */
  function start() {
    $("#setup").hidden = true;
    $("#main").hidden = false;
    const av = $("#me-av");
    av.textContent = state.who.charAt(0);
    av.className = "av av-" + state.who.toLowerCase();
    $("#conn-info").textContent = sb
      ? "Synced with Supabase — Cudii and Ace share the same data."
      : "Saving on this device only. Add Supabase keys in config.js to sync with Ace.";
    go("projects");
    loadAll();
    if (sb) subscribe();
  }

  wire();
  if (state.who) start();
  else showSetup();
})();
