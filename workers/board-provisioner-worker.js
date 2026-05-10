const MANAGED_SECRET_NAMES = [
  "JIRA_CLOUD_ID",
  "JIRA_EMAIL",
  "JIRA_MCP_TOKEN",
  "SLACK_BOT_TOKEN",
  "SLACK_CHANNEL_ID",
  "SLACK_WEBHOOK_URL",
  "SLACK_CHANNEL",
  "QA_EMAIL_TO",
  "QA_EMAIL_FROM",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USERNAME",
  "SMTP_PASSWORD",
  "SMTP_SECURE",
  "SMTP_REJECT_UNAUTHORIZED",
];

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parseJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    throw new Error("Expected a compact JWT.");
  }

  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  const signature = base64UrlDecode(parts[2]);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  return { header, payload, signature, signed };
}

async function verifyRs256Jwt(token, env, options) {
  const jwt = parseJwt(token);
  if (jwt.header.alg !== "RS256") {
    throw new Error("Unsupported JWT algorithm.");
  }

  const jwksResponse = await fetch(options.jwksUrl, {
    headers: { Accept: "application/json" },
  });
  if (!jwksResponse.ok) {
    throw new Error(`Unable to fetch JWKS: HTTP ${jwksResponse.status}`);
  }

  const jwks = await jwksResponse.json();
  const jwk = (jwks.keys || []).find((key) => key.kid === jwt.header.kid);
  if (!jwk) {
    throw new Error("JWT signing key was not found.");
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, jwt.signature, jwt.signed);
  if (!valid) {
    throw new Error("JWT signature is invalid.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (jwt.payload.exp && now > jwt.payload.exp + 60) {
    throw new Error("JWT is expired.");
  }
  if (jwt.payload.nbf && now + 60 < jwt.payload.nbf) {
    throw new Error("JWT is not active yet.");
  }
  if (options.issuer && jwt.payload.iss !== options.issuer) {
    throw new Error("JWT issuer is not allowed.");
  }

  const audiences = Array.isArray(jwt.payload.aud) ? jwt.payload.aud : [jwt.payload.aud];
  if (options.audience && !audiences.includes(options.audience)) {
    throw new Error("JWT audience is not allowed.");
  }

  return jwt.payload;
}

function repositoryAllowed(repository, env) {
  const allowedRepositories = parseList(env.ALLOWED_REPOSITORIES);
  const allowedPrefixes = parseList(env.ALLOWED_REPOSITORY_PREFIXES);

  if (allowedRepositories.includes(repository)) {
    return true;
  }

  return allowedPrefixes.some((prefix) => repository.startsWith(prefix));
}

function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function readBearerToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function authorizeAdmin(request, env) {
  if (env.PROVISIONER_ADMIN_TOKEN) {
    const headerToken = request.headers.get("X-Provisioner-Token") || readBearerToken(request);
    if (headerToken && headerToken === env.PROVISIONER_ADMIN_TOKEN) {
      return { ok: true, actor: "admin-token" };
    }
  }

  if (env.ACCESS_AUD && env.ACCESS_JWKS_URL) {
    const accessToken = request.headers.get("Cf-Access-Jwt-Assertion") || "";
    if (accessToken) {
      const payload = await verifyRs256Jwt(accessToken, env, {
        audience: env.ACCESS_AUD,
        issuer: env.ACCESS_ISSUER || "",
        jwksUrl: env.ACCESS_JWKS_URL,
      });
      const email = String(payload.email || "").toLowerCase();
      const allowedEmails = parseList(env.PROVISIONER_ADMIN_EMAILS || env.ALLOWED_USER_EMAILS).map((item) => item.toLowerCase());
      if (allowedEmails.includes(email)) {
        return { ok: true, actor: email };
      }
    }
  }

  return { ok: false, status: 401, message: "Provisioner admin authorization is required." };
}

async function authorizeGithubActions(request, env) {
  const token = readBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, message: "GitHub OIDC bearer token is required." };
  }

  const payload = await verifyRs256Jwt(token, env, {
    audience: env.GITHUB_OIDC_AUDIENCE || "jira-board-provisioner",
    issuer: env.GITHUB_OIDC_ISSUER || "https://token.actions.githubusercontent.com",
    jwksUrl: env.GITHUB_OIDC_JWKS_URL || "https://token.actions.githubusercontent.com/.well-known/jwks",
  });

  const repository = String(payload.repository || "");
  if (!repository || !repositoryAllowed(repository, env)) {
    return { ok: false, status: 403, message: `Repository ${repository || "unknown"} is not allowed to read managed secrets.` };
  }

  return { ok: true, repository, actor: payload.actor || "" };
}

async function githubFetch(env, path, options = {}) {
  if (!env.GITHUB_PROVISIONER_TOKEN) {
    throw new Error("GITHUB_PROVISIONER_TOKEN is not configured.");
  }

  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_PROVISIONER_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "jira-board-provisioner-worker",
      "X-GitHub-Api-Version": env.GITHUB_API_VERSION || "2022-11-28",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = { raw: text };
  }

  if (!response.ok) {
    const message = payload?.message || payload?.raw || `GitHub API failed with HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function normalizeFixVersion(value) {
  const version = String(value || "").trim();
  if (!/^v\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("fixVersion must look like v3001.124.0.");
  }
  return version;
}

function repoNameFromVersion(version) {
  return `jira-board-${version.toLowerCase().replace(/^v/, "v").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

async function ensureRepository(env, repoName, visibility) {
  const owner = env.TARGET_OWNER || env.TEMPLATE_OWNER;
  const templateOwner = env.TEMPLATE_OWNER;
  const templateRepo = env.TEMPLATE_REPOSITORY || "jira-board-template";

  try {
    return await githubFetch(env, `/repos/${owner}/${repoName}`);
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
  }

  const created = await githubFetch(env, `/repos/${templateOwner}/${templateRepo}/generate`, {
    method: "POST",
    body: JSON.stringify({
      owner,
      name: repoName,
      private: visibility !== "public",
      include_all_branches: false,
    }),
  });

  return created;
}

async function setVariable(env, owner, repoName, name, value) {
  try {
    await githubFetch(env, `/repos/${owner}/${repoName}/actions/variables/${encodeURIComponent(name)}`, {
      method: "PATCH",
      body: JSON.stringify({ name, value }),
    });
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
    await githubFetch(env, `/repos/${owner}/${repoName}/actions/variables`, {
      method: "POST",
      body: JSON.stringify({ name, value }),
    });
  }
}

async function enablePages(env, owner, repoName) {
  try {
    await githubFetch(env, `/repos/${owner}/${repoName}/pages`, {
      method: "POST",
      body: JSON.stringify({
        source: {
          branch: env.DEFAULT_BRANCH || "master",
          path: "/",
        },
      }),
    });
    return "created";
  } catch (error) {
    if (error.status === 409 || error.status === 422) {
      return "already-enabled";
    }
    throw error;
  }
}

async function dispatchRefresh(env, owner, repoName) {
  await githubFetch(env, `/repos/${owner}/${repoName}/actions/workflows/refresh-jira-board.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({
      ref: env.DEFAULT_BRANCH || "master",
      inputs: {},
    }),
  });
}

function dashboardUrl(env, owner, repoName) {
  return `https://${owner.toLowerCase()}.github.io/${repoName}/`;
}

async function handleProvision(request, env) {
  const auth = await authorizeAdmin(request, env);
  if (!auth.ok) {
    return json(auth.status, { ok: false, message: auth.message });
  }

  const input = await request.json().catch(() => ({}));
  const fixVersion = normalizeFixVersion(input.fixVersion || input.version);
  const repoName = String(input.repoName || repoNameFromVersion(fixVersion)).trim();
  const visibility = String(input.visibility || env.DEFAULT_VISIBILITY || "public").toLowerCase();
  const owner = env.TARGET_OWNER || env.TEMPLATE_OWNER;
  const repositorySlug = `${owner}/${repoName}`;
  const dashboard = dashboardUrl(env, owner, repoName);

  if (!repoName || !/^[-a-zA-Z0-9_.]+$/.test(repoName)) {
    return json(400, { ok: false, message: "Repository name contains unsupported characters." });
  }

  const repo = await ensureRepository(env, repoName, visibility);
  const variables = {
    JIRA_FIX_VERSION: fixVersion,
    BOARD_REPOSITORY_SLUG: repositorySlug,
    BOARD_REPOSITORY_NAME: repoName,
    BOARD_OWNER: owner,
    DASHBOARD_URL: dashboard,
    SECRET_PROVIDER_ENDPOINT: env.SECRET_PROVIDER_ENDPOINT || `${new URL(request.url).origin}/actions-secrets`,
    SECRET_PROVIDER_AUDIENCE: env.GITHUB_OIDC_AUDIENCE || "jira-board-provisioner",
    ASSIGNEE_DISPATCH_ENDPOINT: env.ASSIGNEE_DISPATCH_ENDPOINT || "",
    TEST_CHECKLIST_COMMENT_ENDPOINT: env.TEST_CHECKLIST_COMMENT_ENDPOINT || "",
    TRUSTED_GITHUB_ACTORS: env.TRUSTED_GITHUB_ACTORS || owner,
  };

  for (const [name, value] of Object.entries(variables)) {
    if (value) {
      await setVariable(env, owner, repoName, name, value);
    }
  }

  const pages = await enablePages(env, owner, repoName);
  let refresh = "not-requested";
  if (input.runInitialRefresh !== false) {
    await dispatchRefresh(env, owner, repoName);
    refresh = "dispatched";
  }

  return json(201, {
    ok: true,
    actor: auth.actor,
    repository: repo?.html_url || `https://github.com/${repositorySlug}`,
    repositorySlug,
    fixVersion,
    dashboardUrl: dashboard,
    pages,
    refresh,
    actionsUrl: `https://github.com/${repositorySlug}/actions/workflows/refresh-jira-board.yml`,
  });
}

async function handleActionsSecrets(request, env) {
  const auth = await authorizeGithubActions(request, env);
  if (!auth.ok) {
    return json(auth.status, { ok: false, message: auth.message });
  }

  const secrets = {};
  for (const name of MANAGED_SECRET_NAMES) {
    if (env[name]) {
      secrets[name] = env[name];
    }
  }

  return json(200, {
    ok: true,
    repository: auth.repository,
    secrets,
  });
}

function missingSecrets(env) {
  return ["GITHUB_PROVISIONER_TOKEN", "JIRA_CLOUD_ID", "JIRA_EMAIL", "JIRA_MCP_TOKEN"].filter((name) => !env[name]);
}

async function handleStatus(env) {
  const missing = missingSecrets(env);
  return json(missing.length ? 503 : 200, {
    ok: missing.length === 0,
    service: "jira-board-provisioner",
    template: `${env.TEMPLATE_OWNER}/${env.TEMPLATE_REPOSITORY || "jira-board-template"}`,
    targetOwner: env.TARGET_OWNER || env.TEMPLATE_OWNER,
    oidcAudience: env.GITHUB_OIDC_AUDIENCE || "jira-board-provisioner",
    missingSecrets: missing,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/status") {
        return handleStatus(env);
      }

      if (request.method === "POST" && url.pathname === "/provision") {
        return await handleProvision(request, env);
      }

      if (request.method === "GET" && url.pathname === "/actions-secrets") {
        return await handleActionsSecrets(request, env);
      }

      return json(404, { ok: false, message: "Unknown provisioner route." });
    } catch (error) {
      return json(error.status || 500, {
        ok: false,
        message: error instanceof Error ? error.message : "Provisioner request failed.",
      });
    }
  },
};
