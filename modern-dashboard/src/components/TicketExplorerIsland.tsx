import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable
} from "@tanstack/react-table";
import { type CSSProperties, useEffect, useMemo, useState } from "react";

type PullChange = string | {
  key?: string;
  issueKey?: string;
  issue?: { key?: string };
  before?: string;
  after?: string;
};

type PullDiffEntry = {
  currentPulledAt?: string;
  currentPulledAtDisplay?: string;
  previousPulledAtDisplay?: string;
  isBaseline?: boolean;
  added?: PullChange[];
  removed?: PullChange[];
  updated?: PullChange[];
  statusChanges?: PullChange[];
};

type Issue = {
  key?: string;
  url?: string;
  summary?: string;
  type?: string;
  isSubtask?: boolean;
  status?: string;
  priority?: string;
  assignee?: string;
  updatedDisplay?: string;
  components?: string[];
  parent?: { key?: string; summary?: string } | string | null;
  description?: string;
  testChecklist?: {
    files?: Array<{ filename?: string; id?: string }>;
    total?: number;
    testCases?: TestCase[];
  } | null;
};

type TestCase = {
  id?: string;
  title?: string;
  category?: string;
  blocking?: boolean;
  description?: string;
  checks?: string[];
  sourceFile?: string;
};

type DashboardData = {
  version?: string;
  dashboardVersion?: string;
  repositorySlug?: string;
  dashboardUrl?: string;
  jiraFilterUrl?: string;
  assigneeDispatchEndpoint?: string;
  testChecklistCommentEndpoint?: string;
  schemaVersion?: string;
  dataArtifact?: { fileName?: string };
  total?: number;
  pulledAt?: string;
  pulledAtDisplay?: string;
  pullDiff?: PullDiffEntry;
  pullHistory?: PullDiffEntry[];
  issues?: Issue[];
};

type BoardRegistryEntry = {
  release: string;
  fixVersion?: string;
  url: string;
  modernUrl?: string;
  repositorySlug?: string;
  status: "active" | "current" | "planned" | "archived" | string;
  owner: string;
  notes: string;
};

type BoardRegistryAutomation = {
  source?: string;
  hook?: string;
  provisioner?: string;
};

type BoardRegistry = {
  schemaVersion?: string;
  updatedAt?: string;
  owner?: string;
  boards?: BoardRegistryEntry[];
  automation?: BoardRegistryAutomation;
};

type ChangeSets = {
  added: Set<string>;
  updated: Set<string>;
  status: Set<string>;
  any: Set<string>;
};

type Filters = {
  search: string;
  status: string;
  assignee: string;
  priority: string;
  component: string;
  parent: string;
  changed: string;
};

type PresetKey = "all" | "qa" | "review" | "moves" | "unassigned";

type WorkspaceStatus = "draft" | "ready" | "submitting" | "submitted" | "failed";

type ChecklistItem = {
  id: string;
  sourceId: string;
  sourceFile: string;
  manual: boolean;
  title: string;
  done: boolean;
  notes: string;
  description: string;
  checks: string[];
};

type ChecklistWorkspaceState = {
  items: ChecklistItem[];
  evidence: string;
  concerns: string;
  status: WorkspaceStatus;
  message: string;
  submittedAt: string;
};

type AnalyticsTone = "blue" | "green" | "amber" | "rose";

type DistributionRow = {
  label: string;
  value: number;
  share: number;
  tone: AnalyticsTone;
};

type MovementRow = {
  label: string;
  added: number;
  updated: number;
  moved: number;
  removed: number;
  total: number;
};

type ReleaseAnalytics = {
  issueTotal: number;
  mainTotal: number;
  subtaskTotal: number;
  changedTotal: number;
  assignees: DistributionRow[];
  priorities: DistributionRow[];
  components: DistributionRow[];
  movements: MovementRow[];
  insights: string[];
};

type HealthTone = "good" | "attention" | "warning" | "danger" | "neutral";

type HealthLink = {
  label: string;
  href: string;
};

type OperationsHealthItem = {
  title: string;
  status: string;
  detail: string;
  tone: HealthTone;
  links: HealthLink[];
};

type OperationsHealth = {
  summary: string;
  summaryTone: HealthTone;
  items: OperationsHealthItem[];
};

const PAGE_SIZE_OPTIONS = [15, 25, 50];

const EMPTY_FILTERS: Filters = {
  search: "",
  status: "",
  assignee: "",
  priority: "",
  component: "",
  parent: "",
  changed: ""
};

export default function TicketExplorerIsland({ dataUrl, boardRegistryUrl }: { dataUrl: string; boardRegistryUrl: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [boardRegistry, setBoardRegistry] = useState<BoardRegistry | null>(null);
  const [loadError, setLoadError] = useState("");
  const [registryError, setRegistryError] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [activePreset, setActivePreset] = useState<PresetKey>("all");
  const [selectedKey, setSelectedKey] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "updatedDisplay", desc: true }]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    let cancelled = false;

    fetchDashboardData(dataUrl)
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
          setLoadError("");
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setLoadError(error.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  useEffect(() => {
    let cancelled = false;

    fetchBoardRegistry(boardRegistryUrl)
      .then((payload) => {
        if (!cancelled) {
          setBoardRegistry(payload);
          setRegistryError("");
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setBoardRegistry(null);
          setRegistryError(error.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [boardRegistryUrl]);

  const issues = useMemo(() => data?.issues ?? [], [data]);
  const changeSets = useMemo(() => createChangeSets(data), [data]);
  const options = useMemo(() => createFilterOptions(issues), [issues]);
  const operationsHealth = useMemo(() => buildOperationsHealth(data, loadError), [data, loadError]);
  const analytics = useMemo(() => buildReleaseAnalytics(data, issues, changeSets), [data, issues, changeSets]);

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => matchesFilters(issue, filters, changeSets, activePreset));
  }, [issues, filters, changeSets, activePreset]);

  const columns = useMemo<ColumnDef<Issue>[]>(() => [
    {
      id: "key",
      header: "Ticket",
      accessorFn: (issue) => issue.key || "",
      cell: ({ row }) => (
        <div className="ticket-cell">
          <a className="table-ticket-key" href={row.original.url || "#"} target="_blank" rel="noreferrer">
            {row.original.key || "Ticket"}
          </a>
          <span>{row.original.type || "Issue"}</span>
        </div>
      )
    },
    {
      id: "summary",
      header: "Summary",
      accessorFn: (issue) => issue.summary || "",
      cell: ({ row }) => (
        <button className="summary-button" type="button" onClick={() => setSelectedKey(row.original.key || "")}>
          {row.original.summary || "Untitled ticket"}
        </button>
      )
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (issue) => issue.status || "",
      cell: ({ getValue }) => <span className="status-pill">{String(getValue() || "None")}</span>
    },
    {
      id: "assignee",
      header: "Assignee",
      accessorFn: (issue) => issue.assignee || "Unassigned"
    },
    {
      id: "priority",
      header: "Priority",
      accessorFn: (issue) => issue.priority || "None",
      cell: ({ getValue }) => <span className="priority-pill">{String(getValue() || "None")}</span>
    },
    {
      id: "components",
      header: "Components",
      accessorFn: (issue) => formatComponents(issue.components),
      cell: ({ row }) => <span className="component-text">{formatComponents(row.original.components)}</span>
    },
    {
      id: "parent",
      header: "Parent",
      accessorFn: (issue) => parentLabel(issue),
      cell: ({ row }) => <span className="muted-cell">{parentLabel(row.original) || (row.original.isSubtask ? "Subtask" : "Main")}</span>
    },
    {
      id: "updatedDisplay",
      header: "Updated",
      accessorFn: (issue) => issue.updatedDisplay || "",
      cell: ({ getValue }) => <span className="muted-cell">{String(getValue() || "Unknown")}</span>
    },
    {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="row-actions">
          <a href={row.original.url || "#"} target="_blank" rel="noreferrer">Jira</a>
          <button type="button" onClick={() => setSelectedKey(row.original.key || "")}>Details</button>
        </div>
      )
    }
  ], []);

  const table = useReactTable({
    data: filteredIssues,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const sortedRows = table.getRowModel().rows;
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const visibleRows = sortedRows.slice(safePageIndex * pageSize, safePageIndex * pageSize + pageSize);
  const selectedIssue = issues.find((issue) => issue.key === selectedKey) || filteredIssues[0] || issues[0];

  useEffect(() => {
    setPageIndex(0);
  }, [filters, pageSize]);

  useEffect(() => {
    if (selectedIssue?.key && selectedIssue.key !== selectedKey) {
      setSelectedKey(selectedIssue.key);
    }
  }, [selectedIssue, selectedKey]);

  function updateFilter(name: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
    setActivePreset("all");
  }

  function applyPreset(preset: PresetKey) {
    setActivePreset(preset);
    setFilters(presetFilters(preset));
  }

  return (
    <main className="dashboard-shell modern-explorer-shell">
      <section className="board-hero" aria-labelledby="board-title">
        <div className="board-identity">
          <p className="eyebrow">Release dashboard</p>
          <h1 id="board-title">{data?.version || "Loading board"}</h1>
          <p className="board-summary">
            {data
              ? `${data.repositorySlug || "Jira release board"} rendered from ${data.dataArtifact?.fileName || "dashboard-data.json"}.`
              : "Reading the published dashboard data artifact."}
          </p>
          <div className="hero-actions" aria-label="Board links">
            <a className="button-link primary" href={data?.dashboardUrl || "../"}>Current board</a>
            <a className="button-link" href={data?.jiraFilterUrl || "#"} target="_blank" rel="noreferrer">Jira filter</a>
            <a className="button-link" href={bridgeOrigin(data)} target="_blank" rel="noreferrer">Cloudflare bridge</a>
          </div>
        </div>

        <dl className="metric-grid" aria-label="Board metadata">
          <Metric label="Total tickets" value={String(data?.total ?? issues.length)} />
          <Metric label="Last pull" value={data?.pullDiff?.currentPulledAtDisplay || data?.pulledAtDisplay || "Pending"} />
          <Metric label="Shown now" value={`${filteredIssues.length}`} />
          <Metric label="Changed" value={`${changeSets.any.size}`} />
        </dl>
      </section>

      <BoardRegistryDirectory registry={boardRegistry} registryError={registryError} currentVersion={data?.version} />

      <OperationsHealthCenter health={operationsHealth} />

      <ReleaseAnalyticsBand analytics={analytics} />

      <section className="explorer-panel" aria-labelledby="explorer-heading">
        <div className="explorer-toolbar">
          <div>
            <p className="eyebrow">Ticket explorer island</p>
            <h2 id="explorer-heading">Dense scan view</h2>
          </div>
          <div className="preset-group" aria-label="Saved views">
            <PresetButton label="All" active={activePreset === "all"} onClick={() => applyPreset("all")} />
            <PresetButton label="QA testing" active={activePreset === "qa"} onClick={() => applyPreset("qa")} />
            <PresetButton label="Code review" active={activePreset === "review"} onClick={() => applyPreset("review")} />
            <PresetButton label="Status moves" active={activePreset === "moves"} onClick={() => applyPreset("moves")} />
            <PresetButton label="Unassigned" active={activePreset === "unassigned"} onClick={() => applyPreset("unassigned")} />
          </div>
        </div>

        <div className="explorer-filters" aria-label="Ticket filters">
          <label>
            <span>Search</span>
            <input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Ticket, summary, assignee, component" />
          </label>
          <SelectFilter label="Status" value={filters.status} options={options.statuses} onChange={(value) => updateFilter("status", value)} />
          <SelectFilter label="Assignee" value={filters.assignee} options={options.assignees} onChange={(value) => updateFilter("assignee", value)} />
          <SelectFilter label="Priority" value={filters.priority} options={options.priorities} onChange={(value) => updateFilter("priority", value)} />
          <SelectFilter label="Component" value={filters.component} options={options.components} onChange={(value) => updateFilter("component", value)} />
          <label>
            <span>Parent</span>
            <select value={filters.parent} onChange={(event) => updateFilter("parent", event.target.value)}>
              <option value="">All work</option>
              <option value="main">Main tickets</option>
              <option value="subtasks">Subtasks</option>
              <option value="has-parent">Has parent</option>
            </select>
          </label>
          <label>
            <span>Changed</span>
            <select value={filters.changed} onChange={(event) => updateFilter("changed", event.target.value)}>
              <option value="">Any snapshot state</option>
              <option value="any">Any change</option>
              <option value="added">Added</option>
              <option value="updated">Updated</option>
              <option value="status">Status moved</option>
            </select>
          </label>
        </div>

        {loadError ? <p className="load-error">{loadError}</p> : null}

        <div className="explorer-body">
          <div className="table-card">
            <div className="table-summary">
              <span>{filteredIssues.length} matching tickets</span>
              <label>
                <span>Rows</span>
                <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                  {PAGE_SIZE_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>
            <div className="ticket-table-wrap">
              <table className="ticket-table">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th key={header.id}>
                          {header.isPlaceholder ? null : (
                            <button
                              type="button"
                              className="column-sort"
                              disabled={!header.column.getCanSort()}
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              <span>{sortLabel(header.column.getIsSorted())}</span>
                            </button>
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr
                      key={row.id}
                      className={row.original.key === selectedIssue?.key ? "selected-row" : ""}
                      onClick={() => setSelectedKey(row.original.key || "")}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination-bar">
              <button type="button" disabled={safePageIndex === 0} onClick={() => setPageIndex((value) => Math.max(0, value - 1))}>Previous</button>
              <span>Page {safePageIndex + 1} of {pageCount}</span>
              <button type="button" disabled={safePageIndex >= pageCount - 1} onClick={() => setPageIndex((value) => Math.min(pageCount - 1, value + 1))}>Next</button>
            </div>
          </div>

          <TicketDetail issue={selectedIssue} data={data} changeSets={changeSets} />
        </div>
      </section>
    </main>
  );
}

function BoardRegistryDirectory({ registry, registryError, currentVersion }: { registry: BoardRegistry | null; registryError: string; currentVersion?: string }) {
  const boards = registry?.boards || [];

  return (
    <section className="board-registry" aria-labelledby="board-registry-heading">
      <div className="board-registry-heading">
        <div>
          <p className="eyebrow">Board registry</p>
          <h2 id="board-registry-heading">Release board directory</h2>
        </div>
        <span>{registry?.updatedAt ? `Updated ${registry.updatedAt}` : "Registry loading"}</span>
      </div>

      {registryError ? <p className="registry-error">{registryError}</p> : null}

      <div className="board-registry-grid">
        {boards.length ? boards.map((board) => {
          const isCurrent = board.release === currentVersion || board.fixVersion === currentVersion;
          return (
            <article className={isCurrent ? "board-registry-card current" : "board-registry-card"} key={`${board.release}-${board.url}`}>
              <div className="board-card-heading">
                <h3>{board.release}</h3>
                <span className={`board-status ${boardStatusTone(board.status)}`}>{board.status || "listed"}</span>
              </div>
              <p>{board.notes}</p>
              <dl>
                <div><dt>Owner</dt><dd>{board.owner || registry?.owner || "Unassigned"}</dd></div>
                <div><dt>Repo</dt><dd>{board.repositorySlug || "Not configured"}</dd></div>
              </dl>
              <div className="board-card-links">
                <a href={board.url} target="_blank" rel="noreferrer">Live board</a>
                {board.modernUrl ? <a href={board.modernUrl} target="_blank" rel="noreferrer">Modern preview</a> : null}
                {board.repositorySlug ? <a href={`https://github.com/${board.repositorySlug}`} target="_blank" rel="noreferrer">Repo</a> : null}
              </div>
            </article>
          );
        }) : (
          <article className="board-registry-card placeholder">
            <h3>No registry entries loaded</h3>
            <p>Publish boards.json with the release, URL, status, owner, and notes for each board.</p>
          </article>
        )}
      </div>

      <div className="registry-automation">
        <div>
          <h3>Spin-up hook</h3>
          <p>{registry?.automation?.hook || "New board creation should append to boards.json before the first Pages publish."}</p>
        </div>
        <div className="board-card-links">
          {registry?.automation?.source ? <a href={registry.automation.source} target="_blank" rel="noreferrer">Registry source</a> : null}
          {registry?.automation?.provisioner ? <a href={registry.automation.provisioner} target="_blank" rel="noreferrer">Provisioner</a> : null}
        </div>
      </div>
    </section>
  );
}

function OperationsHealthCenter({ health }: { health: OperationsHealth }) {
  return (
    <section className="operations-health" aria-labelledby="operations-heading">
      <div className="operations-heading">
        <div>
          <p className="eyebrow">Operations health</p>
          <h2 id="operations-heading">Separate system status</h2>
        </div>
        <span className={`ops-summary ${health.summaryTone}`}>{health.summary}</span>
      </div>

      <div className="ops-grid">
        {health.items.map((item) => (
          <article className={`ops-card ${item.tone}`} key={item.title}>
            <div className="ops-card-head">
              <span className={`health-dot ${item.tone}`} aria-hidden="true" />
              <span>{item.status}</span>
            </div>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
            {item.links.length ? (
              <div className="ops-links">
                {item.links.map((link) => (
                  <a href={link.href} target="_blank" rel="noreferrer" key={`${item.title}-${link.label}`}>{link.label}</a>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <p className="ops-footnote">
        Failed GitHub Action emails can be historical. Compare the latest pull, Pages preview, and workflow history before treating Jira writes or data refresh as one outage.
      </p>
    </section>
  );
}

function ReleaseAnalyticsBand({ analytics }: { analytics: ReleaseAnalytics }) {
  return (
    <section className="analytics-band" aria-labelledby="analytics-heading">
      <div className="analytics-heading">
        <div>
          <p className="eyebrow">Release analytics</p>
          <h2 id="analytics-heading">Triage signals</h2>
        </div>
        <dl className="analytics-totals" aria-label="Release analytics totals">
          <div><dt>Main</dt><dd>{analytics.mainTotal}</dd></div>
          <div><dt>Subtasks</dt><dd>{analytics.subtaskTotal}</dd></div>
          <div><dt>Changed</dt><dd>{analytics.changedTotal}</dd></div>
        </dl>
      </div>

      <div className="analytics-insights" aria-label="Release analytics summary">
        {analytics.insights.map((insight) => <p key={insight}>{insight}</p>)}
      </div>

      <div className="analytics-grid">
        <DistributionChart
          title="Assignee load"
          description="Current ticket ownership by assignee."
          rows={analytics.assignees}
        />
        <MovementChart rows={analytics.movements} />
        <DistributionChart
          title="Priority mix"
          description="Current release risk split by Jira priority."
          rows={analytics.priorities}
        />
        <DistributionChart
          title="Component concentration"
          description="Components with the most current release tickets."
          rows={analytics.components}
        />
      </div>
    </section>
  );
}

function DistributionChart({ title, description, rows }: { title: string; description: string; rows: DistributionRow[] }) {
  return (
    <article className="analytics-chart">
      <div className="chart-heading">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="bar-list" aria-hidden="true">
        {rows.length ? rows.map((row) => (
          <div className="bar-row" key={row.label}>
            <span>{row.label}</span>
            <div className="bar-track">
              <span className={`bar-fill ${row.tone}`} style={{ "--bar-width": `${row.value ? Math.max(4, row.share) : 0}%` } as CSSProperties} />
            </div>
            <strong>{row.value}</strong>
          </div>
        )) : <p className="analytics-empty">No data available.</p>}
      </div>
      <table className="analytics-table">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Label</th>
            <th scope="col">Tickets</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.value}</td>
              <td>{Math.round(row.share)}%</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={3}>No data available.</td>
            </tr>
          )}
        </tbody>
      </table>
    </article>
  );
}

function MovementChart({ rows }: { rows: MovementRow[] }) {
  const maxTotal = Math.max(1, ...rows.map((row) => row.total));

  return (
    <article className="analytics-chart movement-chart">
      <div className="chart-heading">
        <h3>Status movement history</h3>
        <p>Recent pull-diff activity from the retained dashboard history.</p>
      </div>
      <div className="movement-legend" aria-hidden="true">
        <span className="added">Added</span>
        <span className="updated">Updated</span>
        <span className="moved">Status moved</span>
        <span className="removed">Removed</span>
      </div>
      <div className="movement-list" aria-hidden="true">
        {rows.length ? rows.map((row) => (
          <div className="movement-row" key={row.label}>
            <span>{row.label}</span>
            <div className="movement-track">
              <span className="movement-segment added" style={{ "--segment-width": `${(row.added / maxTotal) * 100}%` } as CSSProperties} />
              <span className="movement-segment updated" style={{ "--segment-width": `${(row.updated / maxTotal) * 100}%` } as CSSProperties} />
              <span className="movement-segment moved" style={{ "--segment-width": `${(row.moved / maxTotal) * 100}%` } as CSSProperties} />
              <span className="movement-segment removed" style={{ "--segment-width": `${(row.removed / maxTotal) * 100}%` } as CSSProperties} />
            </div>
            <strong>{row.total}</strong>
          </div>
        )) : <p className="analytics-empty">No pull history yet.</p>}
      </div>
      <table className="analytics-table">
        <caption>Status movement history</caption>
        <thead>
          <tr>
            <th scope="col">Pull</th>
            <th scope="col">Added</th>
            <th scope="col">Updated</th>
            <th scope="col">Moved</th>
            <th scope="col">Removed</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.added}</td>
              <td>{row.updated}</td>
              <td>{row.moved}</td>
              <td>{row.removed}</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={5}>No pull history yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PresetButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={active ? "preset-button active" : "preset-button"} type="button" onClick={onClick}>
      {label}
    </button>
  );
}

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All {label.toLowerCase()}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TicketDetail({ issue, data, changeSets }: { issue?: Issue; data: DashboardData | null; changeSets: ChangeSets }) {
  if (!issue) {
    return (
      <aside className="ticket-detail-panel">
        <p className="eyebrow">Details</p>
        <h2>No ticket selected</h2>
        <p className="detail-description">Load the data artifact or adjust filters to select a ticket.</p>
      </aside>
    );
  }

  const checklistTotal = issue.testChecklist?.total ?? issue.testChecklist?.testCases?.length ?? 0;
  const changeTags = changeLabels(issue.key || "", changeSets);

  return (
    <aside className="ticket-detail-panel" aria-label="Selected ticket details">
      <p className="eyebrow">Selected ticket</p>
      <div className="detail-heading">
        <a href={issue.url || "#"} target="_blank" rel="noreferrer">{issue.key || "Ticket"}</a>
        <span className="priority-pill">{issue.priority || "None"}</span>
      </div>
      <h2>{issue.summary || "Untitled ticket"}</h2>
      <div className="change-tags">
        {changeTags.length > 0 ? changeTags.map((tag) => <span key={tag}>{tag}</span>) : <span>No pull diff change</span>}
      </div>
      <dl className="detail-grid">
        <div><dt>Status</dt><dd>{issue.status || "None"}</dd></div>
        <div><dt>Assignee</dt><dd>{issue.assignee || "Unassigned"}</dd></div>
        <div><dt>Parent</dt><dd>{parentLabel(issue) || (issue.isSubtask ? "Subtask" : "Main ticket")}</dd></div>
        <div><dt>Checklist</dt><dd>{checklistTotal ? `${checklistTotal} cases` : "No parsed checklist"}</dd></div>
      </dl>
      <p className="detail-description">{descriptionPreview(issue.description)}</p>
      <div className="detail-actions">
        <a className="button-link primary" href={issue.url || "#"} target="_blank" rel="noreferrer">Open Jira</a>
        <a className="button-link" href={data?.dashboardUrl || "../"}>Current board actions</a>
      </div>
      <ChecklistWorkspace issue={issue} data={data} />
    </aside>
  );
}

function ChecklistWorkspace({ issue, data }: { issue: Issue; data: DashboardData | null }) {
  const storageKey = useMemo(() => checklistStorageKey(data, issue), [data, issue]);
  const [workspace, setWorkspace] = useState<ChecklistWorkspaceState>(() => createWorkspace(issue, null));

  useEffect(() => {
    setWorkspace(createWorkspace(issue, storageKey));
  }, [issue, storageKey]);

  useEffect(() => {
    if (!storageKey || workspace.status === "submitting") {
      return;
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify({
        items: workspace.items,
        evidence: workspace.evidence,
        concerns: workspace.concerns,
        status: workspace.status,
        message: workspace.message,
        submittedAt: workspace.submittedAt
      }));
    } catch (error) {
      console.warn("Could not save checklist workspace.", error);
    }
  }, [storageKey, workspace]);

  const completeCount = workspace.items.filter((item) => item.done).length;
  const preview = buildCommentPreview(issue, data, workspace);
  const canSubmit = workspace.items.length > 0 && workspace.status !== "submitting";

  function updateWorkspace(next: Partial<ChecklistWorkspaceState>) {
    setWorkspace((current) => ({
      ...current,
      ...next,
      status: current.status === "submitted" || current.status === "ready" ? "draft" : current.status,
      message: current.status === "failed" ? "" : current.message
    }));
  }

  function updateItem(itemId: string, next: Partial<ChecklistItem>) {
    setWorkspace((current) => ({
      ...current,
      status: current.status === "submitted" || current.status === "ready" ? "draft" : current.status,
      message: current.status === "failed" ? "" : current.message,
      items: current.items.map((item) => item.id === itemId ? { ...item, ...next } : item)
    }));
  }

  function addManualItem() {
    setWorkspace((current) => ({
      ...current,
      status: "draft",
      message: "",
      items: [...current.items, makeManualItem()]
    }));
  }

  function removeItem(itemId: string) {
    setWorkspace((current) => ({
      ...current,
      status: "draft",
      message: "",
      items: current.items.filter((item) => item.id !== itemId)
    }));
  }

  function markReady() {
    setWorkspace((current) => ({
      ...current,
      status: current.items.length ? "ready" : "draft",
      message: current.items.length ? "Ready to submit through the Cloudflare bridge." : "Add at least one test case first."
    }));
  }

  async function submitChecklist() {
    if (!canSubmit) {
      return;
    }

    const endpoint = checklistEndpoint(data);
    if (!endpoint) {
      setWorkspace((current) => ({
        ...current,
        status: "failed",
        message: "Checklist bridge endpoint is not configured for this board."
      }));
      return;
    }

    setWorkspace((current) => ({
      ...current,
      status: "submitting",
      message: "Submitting checklist comment through the Cloudflare bridge..."
    }));

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        credentials: "include",
        body: JSON.stringify(buildChecklistPayload(issue, data, workspace))
      });
      const payload = await response.json().catch(() => ({ ok: false, message: "The checklist bridge returned an unreadable response." }));

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || payload.error || "The checklist bridge rejected the request.");
      }

      setWorkspace((current) => ({
        ...current,
        status: "submitted",
        submittedAt: new Date().toISOString(),
        message: "Jira comment request accepted."
      }));
    } catch (error) {
      setWorkspace((current) => ({
        ...current,
        status: "failed",
        message: error instanceof Error ? error.message : "Bridge could not submit the Jira comment."
      }));
    }
  }

  return (
    <section className="checklist-workspace" aria-label="Checklist workspace">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">QA workspace</p>
          <h3>Checklist workspace</h3>
        </div>
        <span className={`workspace-state ${workspace.status}`}>{workspaceStatusLabel(workspace.status)}</span>
      </div>

      <div className="workspace-progress">
        <span>{completeCount} of {workspace.items.length} complete</span>
        <span>{sourceFileLabels(issue).join(", ") || "Manual checklist"}</span>
      </div>

      <div className="workspace-ticket-fields">
        <label>
          <span>Evidence</span>
          <textarea
            value={workspace.evidence}
            onChange={(event) => updateWorkspace({ evidence: event.target.value })}
            placeholder="Build, environment, data setup, screenshots, or API evidence"
          />
        </label>
        <label>
          <span>Concerns</span>
          <textarea
            value={workspace.concerns}
            onChange={(event) => updateWorkspace({ concerns: event.target.value })}
            placeholder="Risks, follow-ups, blockers, or open questions"
          />
        </label>
      </div>

      <div className="workspace-items">
        {workspace.items.length ? workspace.items.map((item, index) => (
          <article className="workspace-item" key={item.id}>
            <label className="workspace-check">
              <input type="checkbox" checked={item.done} onChange={(event) => updateItem(item.id, { done: event.target.checked })} />
              <span>{index + 1}</span>
            </label>
            <div className="workspace-item-body">
              <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} aria-label="Test case title" />
              <textarea value={item.notes} onChange={(event) => updateItem(item.id, { notes: event.target.value })} placeholder="Result notes" aria-label="Result notes" />
              {item.description || item.checks.length ? (
                <details>
                  <summary>{item.manual ? "Manual case" : "Imported case"}{item.checks.length ? ` / ${item.checks.length} checks` : ""}</summary>
                  {item.description ? <p>{item.description}</p> : null}
                  {item.checks.length ? <ul>{item.checks.map((check) => <li key={check}>{check}</li>)}</ul> : null}
                </details>
              ) : null}
            </div>
            <button className="workspace-remove" type="button" onClick={() => removeItem(item.id)} aria-label="Remove test case">x</button>
          </article>
        )) : <p className="workspace-empty">No test cases yet. Add a manual case to start this checklist.</p>}
      </div>

      <div className="workspace-actions">
        <button type="button" onClick={addManualItem}>Add manual case</button>
        <button type="button" onClick={markReady}>Mark ready</button>
        <button type="button" className="primary-action" disabled={!canSubmit} onClick={submitChecklist}>
          {workspace.status === "submitting" ? "Submitting..." : "Submit Jira comment"}
        </button>
      </div>

      {workspace.message ? <p className={`workspace-message ${workspace.status}`} role="status">{workspace.message}</p> : null}

      <details className="comment-preview" open>
        <summary>Jira comment preview</summary>
        <pre>{preview}</pre>
      </details>
    </section>
  );
}

async function fetchDashboardData(requestedUrl: string): Promise<DashboardData> {
  const candidates = [...new Set([requestedUrl, "dashboard-data.json", "../dashboard-data.json"])]
    .filter(Boolean)
    .map((value) => new URL(value, window.location.href).toString());

  let lastError = "";

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${candidate}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError || "Unable to load dashboard-data.json.");
}

async function fetchBoardRegistry(requestedUrl: string): Promise<BoardRegistry> {
  const candidates = [...new Set([requestedUrl, "../boards.json", "boards.json"])]
    .filter(Boolean)
    .map((value) => new URL(value, window.location.href).toString());

  let lastError = "";

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${candidate}`);
      }

      const registry = await response.json();
      if (!Array.isArray(registry.boards)) {
        throw new Error(`boards array missing from ${candidate}`);
      }

      return registry;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError || "Unable to load boards.json.");
}

function createFilterOptions(issues: Issue[]) {
  return {
    statuses: uniqueValues(issues.map((issue) => issue.status)),
    assignees: uniqueValues(issues.map((issue) => issue.assignee || "Unassigned")),
    priorities: uniqueValues(issues.map((issue) => issue.priority || "None")),
    components: uniqueValues(issues.flatMap((issue) => issue.components || []))
  };
}

function matchesFilters(issue: Issue, filters: Filters, changeSets: ChangeSets, activePreset: PresetKey) {
  const searchText = [
    issue.key,
    issue.summary,
    issue.status,
    issue.priority,
    issue.assignee,
    parentLabel(issue),
    ...(issue.components || [])
  ].filter(Boolean).join(" ").toLowerCase();
  const key = issue.key || "";

  return (!filters.search || searchText.includes(filters.search.toLowerCase()))
    && (!filters.status || issue.status === filters.status)
    && (!filters.assignee || (issue.assignee || "Unassigned") === filters.assignee)
    && (!filters.priority || (issue.priority || "None") === filters.priority)
    && (!filters.component || (issue.components || []).includes(filters.component))
    && matchesParentFilter(issue, filters.parent)
    && matchesChangedFilter(key, filters.changed, changeSets)
    && matchesActivePreset(issue, activePreset, changeSets);
}

function matchesActivePreset(issue: Issue, activePreset: PresetKey, changeSets: ChangeSets) {
  if (activePreset === "qa") {
    return (issue.status || "").toLowerCase().includes("qa");
  }

  if (activePreset === "review") {
    return (issue.status || "").toLowerCase().includes("review");
  }

  if (activePreset === "moves") {
    return changeSets.status.has(issue.key || "");
  }

  if (activePreset === "unassigned") {
    return !issue.assignee || issue.assignee === "Unassigned";
  }

  return true;
}

function matchesParentFilter(issue: Issue, filter: string) {
  if (filter === "main") {
    return !issue.isSubtask;
  }

  if (filter === "subtasks") {
    return Boolean(issue.isSubtask);
  }

  if (filter === "has-parent") {
    return Boolean(issue.parent);
  }

  return true;
}

function matchesChangedFilter(key: string, filter: string, changeSets: ChangeSets) {
  if (!filter) {
    return true;
  }

  if (filter === "any") {
    return changeSets.any.has(key);
  }

  if (filter === "status") {
    return changeSets.status.has(key);
  }

  if (filter === "added") {
    return changeSets.added.has(key);
  }

  if (filter === "updated") {
    return changeSets.updated.has(key);
  }

  return true;
}

function presetFilters(preset: PresetKey): Filters {
  if (preset === "qa") {
    return EMPTY_FILTERS;
  }

  if (preset === "review") {
    return EMPTY_FILTERS;
  }

  if (preset === "moves") {
    return { ...EMPTY_FILTERS, changed: "status" };
  }

  if (preset === "unassigned") {
    return { ...EMPTY_FILTERS, assignee: "Unassigned" };
  }

  return EMPTY_FILTERS;
}

function createChangeSets(data: DashboardData | null): ChangeSets {
  const added = createKeySet(data?.pullDiff?.added);
  const updated = createKeySet(data?.pullDiff?.updated);
  const status = createKeySet(data?.pullDiff?.statusChanges);
  const any = new Set([...added, ...updated, ...status]);
  return { added, updated, status, any };
}

function createKeySet(changes?: PullChange[]) {
  return new Set((changes || []).map(extractChangeKey).filter(Boolean));
}

function extractChangeKey(change: PullChange) {
  if (typeof change === "string") {
    return change;
  }

  return change.key || change.issueKey || change.issue?.key || "";
}

function changeLabels(key: string, changeSets: ChangeSets) {
  return [
    changeSets.added.has(key) ? "Added" : "",
    changeSets.updated.has(key) ? "Updated" : "",
    changeSets.status.has(key) ? "Status moved" : ""
  ].filter(Boolean);
}

function uniqueValues(values: Array<string | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])]
    .sort((left, right) => left.localeCompare(right));
}

function boardStatusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "active" || normalized === "current") {
    return "active";
  }

  if (normalized === "planned") {
    return "planned";
  }

  if (normalized === "archived") {
    return "archived";
  }

  return "listed";
}

function buildOperationsHealth(data: DashboardData | null, loadError: string): OperationsHealth {
  const repo = data?.repositorySlug || "";
  const bridge = bridgeHealth(data);
  const dataStatus: OperationsHealthItem = loadError ? {
    title: "Jira data pull",
    status: "Data blocked",
    detail: loadError,
    tone: "danger",
    links: data?.dataArtifact?.fileName ? [{ label: "Data artifact", href: data.dataArtifact.fileName }] : []
  } : {
    title: "Jira data pull",
    status: data ? "Loaded" : "Loading",
    detail: data
      ? `Latest Jira snapshot: ${latestPullLabel(data)}. This is independent from assign and comment writes.`
      : "Waiting for dashboard-data.json to load.",
    tone: data ? "good" : "neutral",
    links: data?.dataArtifact?.fileName ? [{ label: "Data artifact", href: data.dataArtifact.fileName }] : []
  };

  const pagesStatus: OperationsHealthItem = {
    title: "GitHub Pages preview",
    status: data ? "Published" : "Waiting",
    detail: data
      ? `This modern preview loaded from the published Pages bundle for ${data.version || "this board"}.`
      : "The preview shell is available while the data artifact is loading.",
    tone: data ? "good" : "neutral",
    links: [
      ...(data?.dashboardUrl ? [{ label: "Live board", href: data.dashboardUrl }] : []),
      ...(repo ? [{ label: "Pages deploys", href: `https://github.com/${repo}/deployments` }] : [])
    ]
  };

  const bridgeStatus: OperationsHealthItem = {
    title: "Jira write bridge",
    status: bridge.status,
    detail: bridge.detail,
    tone: bridge.tone,
    links: [
      ...(bridge.statusUrl ? [{ label: bridge.linkLabel, href: bridge.statusUrl }] : []),
      ...(repo ? [{ label: "Assign workflow", href: workflowUrl(repo, "update-jira-assignee.yml") }] : [])
    ]
  };

  const actionsStatus: OperationsHealthItem = {
    title: "Workflow runs",
    status: repo ? "Review live runs" : "Repository unknown",
    detail: repo
      ? "Refreshes, assignee updates, and dashboard push notifications each have separate workflow histories."
      : "Repository metadata is not available in the data artifact.",
    tone: repo ? "attention" : "neutral",
    links: repo ? [
      { label: "Refresh data", href: workflowUrl(repo, "refresh-jira-board.yml") },
      { label: "All Actions", href: `https://github.com/${repo}/actions` }
    ] : []
  };

  const slackStatus: OperationsHealthItem = {
    title: "Slack notifications",
    status: repo ? "Workflow hook" : "Not inspected",
    detail: repo
      ? "Ticket refresh and dashboard push notifications are workflow-driven, so delivery health should be checked separately from bridge auth."
      : "Slack notification status depends on workflow configuration.",
    tone: repo ? "attention" : "neutral",
    links: repo ? [{ label: "Notify workflow", href: workflowUrl(repo, "notify-dashboard-push.yml") }] : []
  };

  const hasDanger = [dataStatus, pagesStatus, bridgeStatus, actionsStatus, slackStatus].some((item) => item.tone === "danger");
  const hasAttention = [dataStatus, pagesStatus, bridgeStatus, actionsStatus, slackStatus].some((item) => item.tone === "attention" || item.tone === "warning");

  return {
    summary: hasDanger ? "Needs attention" : hasAttention ? "Check linked systems" : "Core paths visible",
    summaryTone: hasDanger ? "danger" : hasAttention ? "attention" : "good",
    items: [dataStatus, pagesStatus, bridgeStatus, actionsStatus, slackStatus]
  };
}

function bridgeHealth(data: DashboardData | null): { status: string; detail: string; tone: HealthTone; statusUrl: string; linkLabel: string } {
  const endpoint = data?.assigneeDispatchEndpoint || "";

  if (!data) {
    return {
      status: "Waiting",
      detail: "Bridge configuration will appear after the data artifact loads.",
      tone: "neutral",
      statusUrl: "",
      linkLabel: "Bridge status"
    };
  }

  if (!endpoint) {
    return {
      status: "Not configured",
      detail: "No assignee dispatch endpoint is present in dashboard-data.json.",
      tone: "danger",
      statusUrl: "",
      linkLabel: "Bridge status"
    };
  }

  const statusUrl = bridgeStatusUrl(endpoint);
  if (isLocalBridgeEndpoint(endpoint)) {
    return {
      status: "Local endpoint",
      detail: "This board points at localhost. Live GitHub Pages boards must use the hosted Cloudflare bridge, not a laptop-local bridge.",
      tone: "danger",
      statusUrl,
      linkLabel: "Local status"
    };
  }

  if (isHostedBridgeEndpoint(endpoint)) {
    return {
      status: "Cloudflare Login",
      detail: "Jira assign and checklist comments route through the hosted Worker. Open the Access login/status link if writes need to be re-enabled.",
      tone: "attention",
      statusUrl,
      linkLabel: "Re-enable bridge"
    };
  }

  return {
    status: "External bridge",
    detail: "A non-local dispatch endpoint is configured. Check its status separately from Jira data refresh.",
    tone: "attention",
    statusUrl,
    linkLabel: "Bridge status"
  };
}

function latestPullLabel(data: DashboardData) {
  return data.pullDiff?.currentPulledAtDisplay || data.pulledAtDisplay || data.pulledAt || "pending";
}

function workflowUrl(repositorySlug: string, workflowName: string) {
  return `https://github.com/${repositorySlug}/actions/workflows/${workflowName}`;
}

function bridgeStatusUrl(endpoint: string) {
  return endpoint.replace(/\/assign$/, "/status").replace(/\/comment-checklist$/, "/status");
}

function isLocalBridgeEndpoint(endpoint: string) {
  return /(^|\/\/)(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(endpoint);
}

function isHostedBridgeEndpoint(endpoint: string) {
  return /jira-board-assignee-bridge\.dfkabir253\.workers\.dev/i.test(endpoint);
}

function buildReleaseAnalytics(data: DashboardData | null, issues: Issue[], changeSets: ChangeSets): ReleaseAnalytics {
  const mainTotal = issues.filter((issue) => !issue.isSubtask).length;
  const subtaskTotal = issues.length - mainTotal;
  const pullHistory = (Array.isArray(data?.pullHistory) && data?.pullHistory.length ? data?.pullHistory : data?.pullDiff ? [data.pullDiff] : [])
    .filter(Boolean) as PullDiffEntry[];

  const assignees = toDistributionRows(countBy(issues, (issue) => issue.assignee || "Unassigned"), issues.length, 6, "blue");
  const priorities = toDistributionRows(countBy(issues, (issue) => issue.priority || "None"), issues.length, 6, "amber");
  const components = toDistributionRows(countBy(issues.flatMap((issue) => issue.components?.length ? issue.components : ["No component"]), (component) => component), issues.length, 7, "green");
  const movements = pullHistory.slice(0, 8).reverse().map((entry) => {
    const added = entry.added?.length || 0;
    const updated = entry.updated?.length || 0;
    const moved = entry.statusChanges?.length || 0;
    const removed = entry.removed?.length || 0;
    return {
      label: movementLabel(entry),
      added,
      updated,
      moved,
      removed,
      total: added + updated + moved + removed
    };
  });

  return {
    issueTotal: issues.length,
    mainTotal,
    subtaskTotal,
    changedTotal: changeSets.any.size,
    assignees,
    priorities,
    components,
    movements,
    insights: [
      insightForTop("Ownership", assignees, "has the highest current load"),
      insightForTop("Priority", priorities, "is the largest priority group"),
      insightForTop("Component", components, "has the most release concentration"),
      latestMovementInsight(pullHistory)
    ]
  };
}

function countBy<T>(items: T[], selector: (item: T) => string) {
  return items.reduce((counts, item) => {
    const label = selector(item) || "None";
    counts.set(label, (counts.get(label) || 0) + 1);
    return counts;
  }, new Map<string, number>());
}

function toDistributionRows(counts: Map<string, number>, total: number, limit: number, tone: AnalyticsTone): DistributionRow[] {
  const rows = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);

  return rows.map(([label, value]) => ({
    label,
    value,
    share: total ? (value / total) * 100 : 0,
    tone
  }));
}

function insightForTop(label: string, rows: DistributionRow[], suffix: string) {
  const top = rows[0];
  if (!top) {
    return `${label}: no data available yet.`;
  }

  return `${label}: ${top.label} ${suffix} (${top.value}).`;
}

function latestMovementInsight(history: PullDiffEntry[]) {
  const latest = history[0];
  if (!latest) {
    return "Movement: pull history is not available yet.";
  }

  const total = (latest.added?.length || 0) + (latest.updated?.length || 0) + (latest.statusChanges?.length || 0) + (latest.removed?.length || 0);
  if (latest.isBaseline) {
    return "Movement: latest pull is the baseline snapshot.";
  }

  return total ? `Movement: latest pull recorded ${total} ticket changes.` : "Movement: latest pull recorded no ticket changes.";
}

function movementLabel(entry: PullDiffEntry) {
  const label = entry.currentPulledAtDisplay || entry.currentPulledAt || "Pull";
  return label.replace(/,\s*\d{4}/, "");
}

function formatComponents(components?: string[]) {
  return components && components.length > 0 ? components.join(", ") : "None";
}

function parentLabel(issue: Issue) {
  if (!issue.parent) {
    return "";
  }

  if (typeof issue.parent === "string") {
    return issue.parent;
  }

  return issue.parent.key || issue.parent.summary || "";
}

function descriptionPreview(description?: string) {
  if (!description) {
    return "No description text is available in the artifact.";
  }

  const normalized = description.replace(/\s+/g, " ").trim();
  return normalized.length > 360 ? `${normalized.slice(0, 360)}...` : normalized;
}

function bridgeOrigin(data: DashboardData | null) {
  if (!data?.assigneeDispatchEndpoint) {
    return "#";
  }

  return new URL(data.assigneeDispatchEndpoint).origin;
}

function sortLabel(value: false | "asc" | "desc") {
  if (value === "asc") {
    return "Asc";
  }

  if (value === "desc") {
    return "Desc";
  }

  return "";
}

function createWorkspace(issue: Issue, storageKey: string | null): ChecklistWorkspaceState {
  const baseItems = baseChecklistItems(issue);
  const empty = emptyWorkspace(baseItems);

  if (!storageKey) {
    return empty;
  }

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!saved) {
      return empty;
    }

    const savedItems = Array.isArray(saved.items) ? saved.items : [];
    const savedById = new Map(savedItems.map((item: ChecklistItem) => [item.id, item]));
    const mergedItems = baseItems.map((item) => {
      const savedItem = savedById.get(item.id);
      return savedItem ? normalizeChecklistItem({ ...item, ...savedItem }) : item;
    });

    for (const savedItem of savedItems) {
      if (savedItem?.manual && !mergedItems.some((item) => item.id === savedItem.id)) {
        mergedItems.push(normalizeChecklistItem(savedItem));
      }
    }

    return {
      items: mergedItems,
      evidence: String(saved.evidence || ""),
      concerns: String(saved.concerns || ""),
      status: isWorkspaceStatus(saved.status) ? saved.status : "draft",
      message: String(saved.message || ""),
      submittedAt: String(saved.submittedAt || "")
    };
  } catch (error) {
    console.warn("Could not load checklist workspace.", error);
    return empty;
  }
}

function emptyWorkspace(items: ChecklistItem[] = []): ChecklistWorkspaceState {
  return {
    items,
    evidence: "",
    concerns: "",
    status: "draft",
    message: "",
    submittedAt: ""
  };
}

function isWorkspaceStatus(value: unknown): value is WorkspaceStatus {
  return value === "draft" || value === "ready" || value === "submitting" || value === "submitted" || value === "failed";
}

function baseChecklistItems(issue: Issue): ChecklistItem[] {
  const testCases = Array.isArray(issue.testChecklist?.testCases) ? issue.testChecklist?.testCases : [];

  return testCases.map((testCase, index) => normalizeChecklistItem({
    id: `${testCase.sourceFile || "source"}::${testCase.id || "TC"}::${index}`,
    sourceId: testCase.id || "",
    sourceFile: testCase.sourceFile || "",
    manual: false,
    title: `${testCase.id ? `${testCase.id}: ` : ""}${testCase.title || "Untitled test case"}`,
    done: false,
    notes: "",
    description: testCase.description || "",
    checks: Array.isArray(testCase.checks) ? testCase.checks : []
  }));
}

function normalizeChecklistItem(item: Partial<ChecklistItem>): ChecklistItem {
  return {
    id: String(item.id || makeId("item")),
    sourceId: String(item.sourceId || ""),
    sourceFile: String(item.sourceFile || (item.manual ? "Manual" : "")),
    manual: Boolean(item.manual),
    title: String(item.title || "New test case"),
    done: Boolean(item.done),
    notes: String(item.notes || ""),
    description: String(item.description || ""),
    checks: Array.isArray(item.checks) ? item.checks.map((check) => String(check)) : []
  };
}

function makeManualItem(): ChecklistItem {
  return normalizeChecklistItem({
    id: makeId("manual"),
    manual: true,
    sourceFile: "Manual",
    title: "New test case",
    done: false,
    notes: ""
  });
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}::${crypto.randomUUID()}`;
  }

  return `${prefix}::${Date.now()}::${Math.random().toString(36).slice(2, 8)}`;
}

function checklistStorageKey(data: DashboardData | null, issue: Issue) {
  if (!issue.key) {
    return null;
  }

  const files = sourceFileLabels(issue).join("|") || "manual";
  return `modern-checklist-v1:${data?.version || "unknown"}:${issue.key}:${files}`;
}

function sourceFileLabels(issue: Issue) {
  return (issue.testChecklist?.files || [])
    .map((file) => file.filename || file.id || "")
    .filter(Boolean);
}

function workspaceStatusLabel(status: WorkspaceStatus) {
  if (status === "ready") {
    return "Ready";
  }

  if (status === "submitting") {
    return "Submitting";
  }

  if (status === "submitted") {
    return "Submitted";
  }

  if (status === "failed") {
    return "Failed";
  }

  return "Draft";
}

function checklistEndpoint(data: DashboardData | null) {
  if (data?.testChecklistCommentEndpoint) {
    return data.testChecklistCommentEndpoint;
  }

  if (data?.assigneeDispatchEndpoint) {
    return data.assigneeDispatchEndpoint.replace(/\/assign$/, "/comment-checklist");
  }

  return "";
}

function buildChecklistPayload(issue: Issue, data: DashboardData | null, workspace: ChecklistWorkspaceState) {
  return {
    issueKey: issue.key,
    issueUrl: issue.url,
    summary: issue.summary,
    releaseVersion: data?.version || "",
    repositorySlug: data?.repositorySlug || "",
    dashboardUrl: typeof window === "undefined" ? data?.dashboardUrl || "" : window.location.href,
    sourceFiles: sourceFileLabels(issue),
    items: payloadItems(workspace)
  };
}

function payloadItems(workspace: ChecklistWorkspaceState) {
  const items = workspace.items.map((item) => ({
    title: item.title,
    done: Boolean(item.done),
    notes: item.notes || "",
    images: []
  }));

  if (workspace.evidence || workspace.concerns) {
    items.push({
      title: "Ticket-level evidence and concerns",
      done: Boolean(workspace.evidence && !workspace.concerns),
      notes: [
        workspace.evidence ? `Evidence: ${workspace.evidence}` : "",
        workspace.concerns ? `Concerns: ${workspace.concerns}` : ""
      ].filter(Boolean).join("\n\n"),
      images: []
    });
  }

  return items;
}

function buildCommentPreview(issue: Issue, data: DashboardData | null, workspace: ChecklistWorkspaceState) {
  const items = payloadItems(workspace);
  const complete = items.filter((item) => item.done).length;
  const sourceFiles = sourceFileLabels(issue).join(", ") || "Manual checklist";
  const lines = [
    `Test checklist submitted for ${issue.key || "ticket"}.`,
    `Progress: ${complete} of ${items.length} complete.`,
    `Source: ${sourceFiles}.`,
    `Dashboard: ${data?.dashboardUrl || "Current board"}.`,
    "",
    "| # | Status | Test case | Notes |",
    "| --- | --- | --- | --- |",
    ...items.map((item, index) => `| ${index + 1} | ${item.done ? "Complete" : "Open"} | ${escapeTableCell(item.title)} | ${escapeTableCell(item.notes)} |`)
  ];

  return lines.join("\n");
}

function escapeTableCell(value: string) {
  return String(value || "")
    .replace(/\r?\n/g, "<br>")
    .replace(/\|/g, "\\|")
    .trim();
}
