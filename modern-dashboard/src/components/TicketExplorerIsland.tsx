import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";

type PullChange = string | {
  key?: string;
  issueKey?: string;
  issue?: { key?: string };
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
    total?: number;
    testCases?: unknown[];
  } | null;
};

type DashboardData = {
  version?: string;
  dashboardVersion?: string;
  repositorySlug?: string;
  dashboardUrl?: string;
  jiraFilterUrl?: string;
  assigneeDispatchEndpoint?: string;
  schemaVersion?: string;
  dataArtifact?: { fileName?: string };
  total?: number;
  pulledAtDisplay?: string;
  pullDiff?: {
    currentPulledAtDisplay?: string;
    added?: PullChange[];
    updated?: PullChange[];
    statusChanges?: PullChange[];
  };
  issues?: Issue[];
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

export default function TicketExplorerIsland({ dataUrl }: { dataUrl: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState("");
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

  const issues = useMemo(() => data?.issues ?? [], [data]);
  const changeSets = useMemo(() => createChangeSets(data), [data]);
  const options = useMemo(() => createFilterOptions(issues), [issues]);

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
    </aside>
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
