import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type Role = "Member" | "Publisher" | "Moderator" | "Administrator";
type User = {
  id: number;
  name: string;
  username: string;
  email: string;
  university: string;
  department: string;
  role: Role;
  password?: string;
};
type Publication = {
  id: number;
  title: string;
  author: string;
  department: string;
  year: number;
  abstract: string;
  extractedText?: string;
  fileName?: string;
  owner: string;
  references: string[];
  format: string;
};
type Group = { id: number; name: string; department: string; members: number };

const usersSeed: User[] = [
  {
    id: 1,
    name: "Amina Rahman",
    username: "amina",
    email: "amina@vub.ac.be",
    university: "VUB",
    department: "Computer Science",
    role: "Publisher",
  },
  {
    id: 2,
    name: "Omar Haddad",
    username: "omar",
    email: "omar@vub.ac.be",
    university: "VUB",
    department: "Computer Science",
    role: "Moderator",
  },
  {
    id: 3,
    name: "Nora Janssens",
    username: "nora",
    email: "nora@vub.ac.be",
    university: "VUB",
    department: "Linguistics",
    role: "Member",
  },
  {
    id: 4,
    name: "System Administrator",
    username: "admin",
    email: "admin@vub.ac.be",
    university: "VUB",
    department: "Research Office",
    role: "Administrator",
  },
];
const publicationsSeed: Publication[] = [
  {
    id: 1,
    title: "Trustworthy Search in Digital Libraries",
    author: "Amina Rahman",
    department: "Computer Science",
    year: 2024,
    abstract:
      "A practical study of transparent ranking, query interpretation and user trust in academic search systems.",
    owner: "amina",
    references: [
      "Boolean retrieval revisited",
      "Human-centred information access",
    ],
    format: "PDF",
  },
  {
    id: 2,
    title: "Language, Metadata and Scholarly Identity",
    author: "Nora Janssens",
    department: "Linguistics",
    year: 2022,
    abstract:
      "How normalized author and institution metadata improves discovery across publication repositories.",
    owner: "nora",
    references: ["Names in digital archives"],
    format: "PDF",
  },
  {
    id: 3,
    title: "Departmental Knowledge Graphs",
    author: "Amina Rahman",
    department: "Computer Science",
    year: 2021,
    abstract:
      "A model for connecting publications, references and research groups without losing provenance.",
    owner: "amina",
    references: ["Trustworthy Search in Digital Libraries"],
    format: "PS",
  },
];
const groupsSeed: Group[] = [
  {
    id: 1,
    name: "Software Engineering Group",
    department: "Computer Science",
    members: 2,
  },
  {
    id: 2,
    name: "Digital Humanities Lab",
    department: "Linguistics",
    members: 1,
  },
];

function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(token ? { "x-session": token } : {}),
      ...options.headers,
    },
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}
function matches(
  publication: Publication,
  expression: string,
  author: string,
  from: string,
  to: string,
) {
  const haystack =
    `${publication.title} ${publication.author} ${publication.abstract} ${publication.department}`.toLowerCase();
  const text = expression.trim().toLowerCase();
  const parts = text.split(/\s+(AND|OR|NOT)\s+/i).filter(Boolean);
  let result = !text || haystack.includes(parts[0] || "");
  for (let index = 1; index < parts.length; index += 2) {
    const operator = parts[index].toUpperCase();
    const found = haystack.includes(parts[index + 1]);
    result =
      operator === "AND"
        ? result && found
        : operator === "OR"
          ? result || found
          : result && !found;
  }
  return (
    result &&
    (!author ||
      publication.author.toLowerCase().includes(author.toLowerCase())) &&
    (!from || publication.year >= Number(from)) &&
    (!to || publication.year <= Number(to))
  );
}

function App() {
  const [users, setUsers] = useState(() => stored("pms-users", usersSeed));
  const [publications, setPublications] = useState(() =>
    stored("pms-publications", publicationsSeed),
  );
  const [groups, setGroups] = useState(() => stored("pms-groups", groupsSeed));
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState("");
  const [page, setPage] = useState("search");
  const [network, setNetwork] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [selected, setSelected] = useState<Publication | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [author, setAuthor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const flash = (type: string, text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage({ type: "", text: "" }), 4000);
  };
  useEffect(() => {
    api<{ users: User[]; publications: Publication[]; groups: Group[] }>(
      "/api/bootstrap",
      {},
      session,
    )
      .then((data) => {
        setUsers(data.users);
        setPublications(data.publications);
        setGroups(data.groups);
      })
      .catch((error: Error) =>
        flash("error", `API unavailable: ${error.message}`),
      );
  }, [session]);
  useEffect(() => {
    api<{ recognized: boolean }>("/api/network")
      .then((data) => setNetwork(data.recognized))
      .catch(() => setNetwork(false));
  }, []);
  const results = useMemo(
    () => publications.filter((item) => matches(item, query, author, from, to)),
    [publications, query, author, from, to],
  );
  const mine = publications.filter((item) => item.owner === user?.username);
  const canAdmin = user?.role === "Administrator" || user?.role === "Moderator";
  async function login(username: string, password: string) {
    try {
      const data = await api<{ user: User; token: string }>("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setSession(data.token);
      setUser(data.user);
      flash("success", `Welcome back, ${data.user.name}.`);
    } catch (error) {
      flash("error", `Login failed: ${(error as Error).message}`);
    }
  }
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries(form.entries());
    try {
      const data = await api<{ user: User }>("/api/register", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setUsers((items) => [...items, data.user]);
      setRegisterOpen(false);
      flash(
        "success",
        "Account created. You can now sign in with your username and password.",
      );
    } catch (error) {
      flash("error", `Registration failed: ${(error as Error).message}`);
    }
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = new FormData(event.currentTarget);
    try {
      const data = await api<{ publication: Publication }>(
        "/api/publications",
        { method: "POST", body: form },
        session,
      );
      setPublications((items) => [data.publication, ...items]);
      setUploadOpen(false);
      flash("success", "File uploaded and text extracted from the document.");
    } catch (error) {
      flash("error", `Upload failed: ${(error as Error).message}`);
    }
  }
  async function roleChange(target: User, role: Role) {
    if (!user) return;
    try {
      const data = await api<{ user: User }>(
        `/api/users/${target.id}/role`,
        { method: "POST", body: JSON.stringify({ role }) },
        session,
      );
      setUsers((items) =>
        items.map((item) => (item.id === data.user.id ? data.user : item)),
      );
      flash("success", `${target.username} is now a ${role}.`);
    } catch (error) {
      flash("error", `Authorization denied: ${(error as Error).message}`);
    }
  }
  async function deleteGroup(group: Group) {
    if (!user) return;
    try {
      await api("/api/groups/" + group.id, { method: "DELETE" }, session);
      setGroups((items) => items.filter((item) => item.id !== group.id));
      flash("success", `${group.name} deleted.`);
    } catch (error) {
      flash("error", `Group action denied: ${(error as Error).message}`);
    }
  }
  async function addGroup() {
    if (!user) return;
    const name = window.prompt("Group name");
    if (!name?.trim()) return;
    try {
      const data = await api<{ group: Group }>(
        "/api/groups",
        { method: "POST", body: JSON.stringify({ name }) },
        session,
      );
      setGroups((items) => [...items, data.group]);
      flash("success", `${data.group.name} created.`);
    } catch (error) {
      flash("error", `Group action denied: ${(error as Error).message}`);
    }
  }
  async function createUser() {
    if (!user || user.role !== "Administrator")
      return flash("error", "Only Administrators may create users.");
    const name = window.prompt("Full name");
    const username = window.prompt("Username");
    const email = window.prompt("Email");
    const department = window.prompt("Department");
    const password = window.prompt("Temporary password (8+ characters)");
    if (!name || !username || !email || !department || !password) return;
    try {
      const data = await api<{ user: User }>(
        "/api/users",
        {
          method: "POST",
          body: JSON.stringify({
            name,
            username,
            email,
            department,
            university: "VUB",
            password,
          }),
        },
        session,
      );
      setUsers((items) => [...items, data.user]);
      flash("success", `${data.user.username} created.`);
    } catch (error) {
      flash("error", `User creation failed: ${(error as Error).message}`);
    }
  }
  async function editUser(target: User) {
    if (!user) return;
    const name = window.prompt("Full name", target.name);
    const email = window.prompt("Email", target.email);
    const department =
      user.role === "Administrator"
        ? window.prompt("Department", target.department)
        : target.department;
    if (!name || !email || !department) return;
    try {
      const data = await api<{ user: User }>(
        `/api/users/${target.id}`,
        { method: "PATCH", body: JSON.stringify({ name, email, department }) },
        session,
      );
      setUsers((items) =>
        items.map((item) => (item.id === target.id ? data.user : item)),
      );
      flash("success", `${target.username} updated.`);
    } catch (error) {
      flash("error", `User update failed: ${(error as Error).message}`);
    }
  }
  async function deleteUser(target: User) {
    if (!user || !window.confirm(`Delete ${target.name}?`)) return;
    try {
      await api(`/api/users/${target.id}`, { method: "DELETE" }, session);
      setUsers((items) => items.filter((item) => item.id !== target.id));
      flash("success", `${target.username} deleted.`);
    } catch (error) {
      flash("error", `User deletion failed: ${(error as Error).message}`);
    }
  }
  if (!user)
    return (
      <Login
        onLogin={login}
        network={network}
        setNetwork={setNetwork}
        openRegister={() => setRegisterOpen(true)}
        registerOpen={registerOpen}
        onRegister={register}
        closeRegister={() => setRegisterOpen(false)}
      />
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="profile">
          <Avatar name={user.name} />
          <div>
            <strong>{user.name}</strong>
            <small>
              {user.role} · {user.department}
            </small>
          </div>
        </div>
        <nav>
          <Nav
            active={page === "search"}
            icon="⌕"
            text="Publication search"
            click={() => setPage("search")}
          />
          <Nav
            active={page === "mine"}
            icon="▤"
            text="My publications"
            click={() => setPage("mine")}
          />
          {canAdmin && (
            <Nav
              active={page === "admin"}
              icon="⚙"
              text="Administration"
              click={() => setPage("admin")}
            />
          )}
          <Nav
            active={page === "account"}
            icon="◎"
            text="My account"
            click={() => setPage("account")}
          />
        </nav>
        <div className="sidebar-bottom">
          <div className="network">
            <Dot />
            <div>
              <strong>VUB network</strong>
              <small>
                {network ? "Recognized by server" : "External access"}
              </small>
            </div>
            <Toggle on={network} click={() => setNetwork(!network)} />
          </div>
          <button className="logout" onClick={() => setUser(null)}>
            ↪ Sign out
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">
              PUBLICATIONS MANAGEMENT SYSTEM / {page.toUpperCase()}
            </span>
            <h1>
              {page === "search"
                ? "Find knowledge"
                : page === "mine"
                  ? "My publications"
                  : page === "admin"
                    ? "System administration"
                    : "Account settings"}
            </h1>
          </div>
          <span className="live">
            <Dot /> SYSTEM OPERATIONAL{" "}
            <button
              className="help"
              onClick={() =>
                flash(
                  "info",
                  "Demo accounts: amina / omar / admin. Search supports AND, OR and NOT.",
                )
              }
            >
              ?
            </button>
          </span>
        </header>
        {message.text && (
          <div className={`notice ${message.type}`}>
            <strong>
              {message.type === "error" ? "Action blocked" : "Action completed"}
            </strong>
            <span>{message.text}</span>
          </div>
        )}
        {page === "search" && (
          <Search
            results={results}
            query={query}
            setQuery={setQuery}
            author={author}
            setAuthor={setAuthor}
            from={from}
            setFrom={setFrom}
            to={to}
            setTo={setTo}
            network={network}
            clear={() => {
              setQuery("");
              setAuthor("");
              setFrom("");
              setTo("");
            }}
            select={setSelected}
          />
        )}
        {page === "mine" && (
          <Mine
            items={mine}
            select={setSelected}
            upload={() => setUploadOpen(true)}
            canUpload={user.role !== "Member"}
          />
        )}
        {page === "admin" && (
          <Admin
            users={users}
            groups={groups}
            current={user}
            userFilter={userFilter}
            setUserFilter={setUserFilter}
            groupFilter={groupFilter}
            setGroupFilter={setGroupFilter}
            roleChange={roleChange}
            deleteGroup={deleteGroup}
            addGroup={addGroup}
            createUser={createUser}
            editUser={editUser}
            deleteUser={deleteUser}
          />
        )}
        {page === "account" && <Account user={user} />}
      </main>
      {selected && <Details item={selected} close={() => setSelected(null)} />}
      {uploadOpen && (
        <Upload close={() => setUploadOpen(false)} submit={upload} />
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">P</span>
      <div>
        <strong>PMS</strong>
        <small>PUBLICATIONS MANAGEMENT</small>
      </div>
    </div>
  );
}
function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <div className={`avatar${large ? " large" : ""}`}>{name.charAt(0)}</div>
  );
}
function Dot() {
  return <span className="status-dot" />;
}
function Toggle({
  on,
  click,
  disabled = true,
}: {
  on: boolean;
  click: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="switch"
      onClick={disabled ? undefined : click}
      disabled={disabled}
      aria-label={on ? "Network recognized" : "External access"}
    >
      <span className={on ? "on" : ""} />
    </button>
  );
}
function Nav({
  active,
  icon,
  text,
  click,
}: {
  active: boolean;
  icon: string;
  text: string;
  click: () => void;
}) {
  return (
    <button className={`nav-item${active ? " active" : ""}`} onClick={click}>
      <span>{icon}</span>
      {text}
    </button>
  );
}
function Login({
  onLogin,
  network,
  setNetwork,
  openRegister,
  registerOpen,
  onRegister,
  closeRegister,
}: {
  onLogin: (name: string, password: string) => void;
  network: boolean;
  setNetwork: (value: boolean) => void;
  openRegister: () => void;
  registerOpen: boolean;
  onRegister: (event: FormEvent<HTMLFormElement>) => void;
  closeRegister: () => void;
}) {
  const [name, setName] = useState("amina");
  const [password, setPassword] = useState("password123");
  return (
    <div className="login-page">
      <div className="login-art">
        <div className="orbit" />
        <div className="login-copy">
          <span className="eyebrow">VUB / RESEARCH KNOWLEDGE</span>
          <h1>
            Make every
            <br />
            <em>connection</em> count.
          </h1>
          <p>
            A calm, searchable home for the work your department is building.
          </p>
          <div className="login-stat">
            <strong>1,248</strong>
            <span>
              indexed publications
              <br />
              across VUB departments
            </span>
          </div>
        </div>
      </div>
      <div className="login-panel">
        <Brand />
        <div className="login-form">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to your library</h2>
          <p>Use a demo account to explore each permission level.</p>
          <label>
            Username
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button
            className="primary full"
            onClick={() => onLogin(name, password)}
          >
            Sign in <span>→</span>
          </button>
          <div className="network-login">
            <Dot />
            <span>
              <strong>VUB network access</strong>
              <small>Search without an account when recognized</small>
            </span>
            <Toggle on={network} click={() => setNetwork(!network)} />
          </div>
          <button className="text-button" onClick={openRegister}>
            Request a new account <span>→</span>
          </button>
        </div>
        <div className="login-footer">
          SE3002 BASELINE · BUILD 01 ·{" "}
          {network ? "NETWORK RECOGNIZED" : "EXTERNAL ACCESS"}
        </div>
      </div>
      {registerOpen && <Register close={closeRegister} submit={onRegister} />}
    </div>
  );
}
function Search({
  results,
  query,
  setQuery,
  author,
  setAuthor,
  from,
  setFrom,
  to,
  setTo,
  network,
  clear,
  select,
}: {
  results: Publication[];
  query: string;
  setQuery: (v: string) => void;
  author: string;
  setAuthor: (v: string) => void;
  from: string;
  setFrom: (v: string) => void;
  to: string;
  setTo: (v: string) => void;
  network: boolean;
  clear: () => void;
  select: (p: Publication) => void;
}) {
  return (
    <section className="content-section">
      <div className="search-card">
        <div className="search-heading">
          <div>
            <span className="eyebrow">DISCOVERY / ADVANCED SEARCH</span>
            <h2>What are you looking for?</h2>
          </div>
          <span className="access-pill">
            <Dot />
            {network ? "VUB network search enabled" : "Signed-in search"}
          </span>
        </div>
        <div className="search-input-wrap">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try: trustworthy AND search, or metadata NOT graph"
          />
        </div>
        <div className="filter-row">
          <label>
            Author
            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Any author"
            />
          </label>
          <label>
            Published from
            <input
              type="number"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              placeholder="Year"
            />
          </label>
          <label>
            Published to
            <input
              type="number"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="Year"
            />
          </label>
          <button className="secondary" onClick={clear}>
            Clear
          </button>
        </div>
        <div className="search-tip">
          ⓘ Supports boolean operators <strong>AND</strong>, <strong>OR</strong>
          , <strong>NOT</strong> and author/date filters.
        </div>
      </div>
      <div className="results-header">
        <div>
          <span className="eyebrow">INDEX RESULTS</span>
          <h2>{results.length} publications found</h2>
        </div>
      </div>
      <div className="publication-list">
        {results.length ? (
          results.map((item) => (
            <article className="publication-row" key={item.id}>
              <div className="pub-year">
                {item.year}
                <small>{item.format}</small>
              </div>
              <div className="pub-main">
                <button className="title-link" onClick={() => select(item)}>
                  {item.title}
                </button>
                <p>{item.abstract}</p>
                <div className="pub-meta">
                  <span>{item.author}</span>
                  <span>{item.department}</span>
                  <span>{item.references.length} references</span>
                </div>
              </div>
              <button className="icon-button" onClick={() => select(item)}>
                ↗
              </button>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <span>⌕</span>
            <h3>No publications match those criteria</h3>
            <p>Try broadening the keywords or removing a date filter.</p>
          </div>
        )}
      </div>
    </section>
  );
}
function Mine({
  items,
  select,
  upload,
  canUpload,
}: {
  items: Publication[];
  select: (p: Publication) => void;
  upload: () => void;
  canUpload: boolean;
}) {
  return (
    <section className="content-section">
      <div className="section-intro">
        <div>
          <span className="eyebrow">OWNERSHIP / PUBLISHER WORKSPACE</span>
          <h2>Your publication shelf</h2>
          <p>
            Review extracted metadata, confirm details, and edit only work you
            own.
          </p>
        </div>
        {canUpload && (
          <button className="primary" onClick={upload}>
            ＋ Upload publication
          </button>
        )}
      </div>
      <div className="metric-strip">
        <div>
          <strong>{items.length}</strong>
          <span>owned publications</span>
        </div>
        <div>
          <strong>
            {items.reduce((total, item) => total + item.references.length, 0)}
          </strong>
          <span>linked references</span>
        </div>
        <div>
          <strong>100%</strong>
          <span>ownership scoped</span>
        </div>
      </div>
      <div className="publication-list">
        {items.map((item) => (
          <article className="publication-row" key={item.id}>
            <div className="pub-year">
              {item.year}
              <small>{item.format}</small>
            </div>
            <div className="pub-main">
              <button className="title-link" onClick={() => select(item)}>
                {item.title}
              </button>
              <p>{item.abstract}</p>
              <div className="pub-meta">
                <span>Extracted metadata ready</span>
                <span>{item.references.length} references</span>
              </div>
            </div>
            <button className="secondary compact" onClick={() => select(item)}>
              Edit details
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
function Admin({
  users,
  groups,
  current,
  userFilter,
  setUserFilter,
  groupFilter,
  setGroupFilter,
  roleChange,
  deleteGroup,
  addGroup,
  createUser,
  editUser,
  deleteUser,
}: {
  users: User[];
  groups: Group[];
  current: User;
  userFilter: string;
  setUserFilter: (v: string) => void;
  groupFilter: string;
  setGroupFilter: (v: string) => void;
  roleChange: (u: User, r: Role) => void;
  deleteGroup: (g: Group) => void;
  addGroup: () => void;
  createUser: () => void;
  editUser: (u: User) => void;
  deleteUser: (u: User) => void;
}) {
  const people = users.filter((item) =>
    `${item.name} ${item.username} ${item.department}`
      .toLowerCase()
      .includes(userFilter.toLowerCase()),
  );
  const filteredGroups = groups.filter(
    (item) =>
      (current.role === "Administrator" ||
        item.department === current.department) &&
      item.name.toLowerCase().includes(groupFilter.toLowerCase()),
  );
  return (
    <section className="content-section admin-grid">
      <div className="admin-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">3.2.23–26 / USER MANAGEMENT</span>
            <h2>People & access</h2>
          </div>
          <div>
            <input className="small-search" value={userFilter} onChange={(event) => setUserFilter(event.target.value)} placeholder="Search users" />
            {current.role === "Administrator" && <button className="secondary compact" onClick={createUser}>＋ New user</button>}
          </div>
        </div>
        {people.map((item) => (
          <div className="user-row" key={item.id}>
            <Avatar name={item.name} />
            <div className="user-info">
              <strong>{item.name}</strong>
              <small>
                @{item.username} · {item.department}
              </small>
            </div>
            <select
              value={item.role}
              disabled={
                item.username === current.username ||
                (current.role === "Moderator" &&
                  item.department !== current.department)
              }
              onChange={(event) => roleChange(item, event.target.value as Role)}
            >
              <option>Member</option>
              <option>Publisher</option>
              <option>Moderator</option>
              <option>Administrator</option>
            </select>
            {item.username !== current.username && <button className="secondary compact" onClick={() => editUser(item)}>Edit</button>}
            {current.role === "Administrator" && item.username !== current.username && <button className="icon-button danger" onClick={() => deleteUser(item)}>×</button>}
          </div>
        ))}
      </div>
      <div className="admin-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">3.2.27–30 / GROUP MANAGEMENT</span>
            <h2>Research groups</h2>
          </div>
          <button className="secondary compact" onClick={addGroup}>
            ＋ New group
          </button>
        </div>
        <input
          className="small-search group-search"
          value={groupFilter}
          onChange={(event) => setGroupFilter(event.target.value)}
          placeholder="Search groups"
        />
        {filteredGroups.map((item) => (
          <div className="group-row" key={item.id}>
            <div className="group-icon">⌂</div>
            <div>
              <strong>{item.name}</strong>
              <small>
                {item.department} · {item.members} member
                {item.members === 1 ? "" : "s"}
              </small>
            </div>
            <button
              className="icon-button danger"
              onClick={() => deleteGroup(item)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="security-panel">
        <span className="security-icon">✓</span>
        <div>
          <span className="eyebrow">SECURITY CONTROL</span>
          <h3>Role boundaries are active</h3>
          <p>
            Moderators are limited to Member ↔ Publisher within their own
            department. Administrators may manage every level.
          </p>
        </div>
      </div>
    </section>
  );
}
function Account({ user }: { user: User }) {
  return (
    <section className="content-section">
      <div className="account-card">
        <div className="account-header">
          <Avatar name={user.name} large />
          <div>
            <span className="eyebrow">PERSONAL DATA / 3.2.19</span>
            <h2>{user.name}</h2>
            <p>
              {user.role} · {user.department}
            </p>
          </div>
        </div>
        <div className="account-fields">
          <label>
            Full name
            <input defaultValue={user.name} />
          </label>
          <label>
            Username
            <input defaultValue={user.username} disabled />
          </label>
          <label>
            Email address
            <input defaultValue={user.email} />
          </label>
          <label>
            University
            <input defaultValue={user.university} />
          </label>
          <label>
            Department
            <input defaultValue={user.department} />
          </label>
          <button className="primary">
            Save changes <span>→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
function Details({ item, close }: { item: Publication; close: () => void }) {
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal publication-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={close}>
          ×
        </button>
        <span className="eyebrow">PUBLICATION DETAIL / {item.format}</span>
        <h2>{item.title}</h2>
        <p className="modal-author">
          {item.author} · {item.department} · {item.year}
        </p>
        <div className="modal-rule" />
        <span className="eyebrow">ABSTRACT</span>
        <p>{item.abstract}</p>
        <div className="reference-block">
          <span className="eyebrow">
            CITED REFERENCES ({item.references.length})
          </span>
          {item.references.length ? (
            item.references.map((reference) => (
              <div key={reference}>↳ {reference}</div>
            ))
          ) : (
            <p>No references extracted yet.</p>
          )}
        </div>
        <button className="primary" onClick={close}>
          Close details
        </button>
      </div>
    </div>
  );
}
function Upload({
  close,
  submit,
}: {
  close: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-backdrop" onClick={close}>
      <form
        className="modal"
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
        encType="multipart/form-data"
      >
        <button type="button" className="modal-close" onClick={close}>
          ×
        </button>
        <span className="eyebrow">3.2.22 / NEW PUBLICATION</span>
        <h2>Upload &amp; extract metadata</h2>
        <p>
          Upload the complete PDF or PS document. The server extracts readable
          text for you to confirm.
        </p>
        <label>
          Publication file
          <input
            name="file"
            type="file"
            accept=".pdf,.ps,application/pdf,application/postscript"
            required
          />
        </label>
        <div className="two-col">
          <label>
            Title override
            <input name="title" placeholder="Optional: use document title" />
          </label>
          <label>
            Year
            <input name="year" type="number" defaultValue="2025" />
          </label>
        </div>
        <button className="primary full">
          Upload and extract <span>→</span>
        </button>
      </form>
    </div>
  );
}
function Register({
  close,
  submit,
}: {
  close: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-backdrop" onClick={close}>
      <form
        className="modal register-modal"
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={close}>
          ×
        </button>
        <span className="eyebrow">3.2.3 / ACCOUNT REQUEST</span>
        <h2>Create your PMS account</h2>
        <div className="two-col">
          <label>
            Full name
            <input name="name" required />
          </label>
          <label>
            Username
            <input name="username" required />
          </label>
        </div>
        <label>
          Email address
          <input name="email" type="email" required />
        </label>
        <div className="two-col">
          <label>
            University
            <input name="university" defaultValue="VUB" required />
          </label>
          <label>
            Department
            <input name="department" required />
          </label>
        </div>
        <label>
          Password
          <input name="password" type="password" minLength={8} required />
        </label>
        <button className="primary full">
          Submit registration <span>→</span>
        </button>
      </form>
    </div>
  );
}

export default App;
