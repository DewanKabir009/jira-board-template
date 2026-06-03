# CORE QA Headquarters

Status: started.

## Purpose

CORE QA Headquarters turns the standalone release dashboard into a broader project test bench. The hub should collect release boards, knowledge-base links, approved automation, AI summaries, operations status, and permission-aware sections in one application.

## Initial Scope

- Release-board tabs for v3001.122.0, v3001.123.0, and v3001.124.0.
- Knowledge-base registry with external page links and preview metadata.
- Automation bench registry for Playwright and Python API scripts.
- AI release summary placeholder for the active dashboard.
- Operations status cards fed by future API automation.
- Permission-aware locked section pattern.

## Delivery Model

The first implementation is a static Astro route at `/hq/` so it can live beside the current dashboard without disrupting `/modern/`. Later specs move hosting and dynamic APIs to Cloudflare Workers with Static Assets.

## Specs

- SPEC-HQ-00: Product shell.
- SPEC-HQ-01: Board registry.
- SPEC-HQ-02: Cloudflare hosting.
- SPEC-HQ-03: Auth and permissions.
- SPEC-HQ-04: Knowledge base.
- SPEC-HQ-05: Automation bench.
- SPEC-HQ-06: Operational status.
- SPEC-HQ-07: AI release summary.
- SPEC-HQ-08: Admin console.
