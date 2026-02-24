# Route Renaming + Login Redirect Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename routes (`/confidential-ai` -> `/chat`, `/personal-agents` -> `/agents`), fix login to return users to the page they were on, and add backward-compatible redirects.

**Architecture:** Move Next.js App Router directories to new names, restructure agents routes (merge workspace into root, move waitlist to sub-route), update all internal link references, change auth fallback from `/confidential-ai` to `/`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Auth

---

### Task 1: Move `/confidential-ai` route to `/chat`

**Files:**
- Rename: `frontend/app/confidential-ai/page.tsx` -> `frontend/app/chat/page.tsx`

**Step 1: Rename the directory**

```bash
cd frontend && git mv app/confidential-ai app/chat
```

**Step 2: Verify the file exists at new location**

```bash
ls frontend/app/chat/page.tsx
```

Expected: file exists

**Step 3: Commit**

```bash
git add -A && git commit -m "refactor(frontend): rename /confidential-ai route to /chat"
```

---

### Task 2: Restructure `/personal-agents` to `/agents`

The current structure:
- `app/personal-agents/page.tsx` — gate page (redirects beta users to workspace, shows waitlist otherwise)
- `app/personal-agents/layout.tsx` — metadata layout
- `app/personal-agents/waitlist-content.tsx` — waitlist UI component
- `app/personal-agents/workspace/page.tsx` — actual workspace
- `app/personal-agents/workspace/layout.tsx` — beta role guard

New structure:
- `app/agents/page.tsx` — workspace (from workspace/page.tsx)
- `app/agents/layout.tsx` — metadata + beta role guard (merged)
- `app/agents/waitlist/page.tsx` — gate page (from page.tsx)
- `app/agents/waitlist/waitlist-content.tsx` — waitlist UI (moved)

**Files:**
- Rename directory: `frontend/app/personal-agents/` -> `frontend/app/agents/`
- Move: `workspace/page.tsx` -> `page.tsx` (workspace becomes root)
- Move: `page.tsx` + `waitlist-content.tsx` -> `waitlist/`
- Merge: `workspace/layout.tsx` beta guard into `layout.tsx`
- Remove: `workspace/` directory

**Step 1: Rename the directory**

```bash
cd frontend && git mv app/personal-agents app/agents
```

**Step 2: Move workspace page to be the root page**

Save the current gate page and waitlist to a waitlist sub-dir first:

```bash
mkdir -p app/agents/waitlist
git mv app/agents/page.tsx app/agents/waitlist/page.tsx
git mv app/agents/waitlist-content.tsx app/agents/waitlist/waitlist-content.tsx
```

Then move workspace page to root:

```bash
git mv app/agents/workspace/page.tsx app/agents/page.tsx
```

**Step 3: Merge workspace layout beta guard into agents layout**

Replace `frontend/app/agents/layout.tsx` with:

```tsx
import type React from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthenticatedAccessError, isPlaywrightAuthBypassEnabled, requireBetaUser } from "@/lib/auth"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Private AI Agents | Umbra",
  description:
    "AI agents that run in verified confidential environments. Your data never leaves unencrypted.",
}

export default async function AgentsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (isPlaywrightAuthBypassEnabled()) {
    return <>{children}</>
  }

  try {
    const client = await createSupabaseServerClient()
    await requireBetaUser(client)
  } catch (error) {
    if (error instanceof AuthenticatedAccessError) {
      if (error.status === 401) {
        redirect("/sign-in?auth=required&redirect=/agents")
      }
      if (error.status === 403) {
        redirect("/agents/waitlist")
      }
    }
    throw error
  }

  return <>{children}</>
}
```

**Step 4: Update waitlist gate page**

Replace `frontend/app/agents/waitlist/page.tsx` with:

```tsx
import { redirect } from "next/navigation"
import {
  getAuthUser,
  hasRole,
  getRequiredBetaRole,
  isPlaywrightAuthBypassEnabled,
} from "@/lib/auth"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import PersonalAgentsWaitlistContent from "./waitlist-content"

export default async function AgentsWaitlistPage() {
  let shouldRedirect = false

  try {
    if (!isPlaywrightAuthBypassEnabled()) {
      const client = await createSupabaseServerClient()
      const user = await getAuthUser(client)
      if (user && hasRole(user, getRequiredBetaRole())) {
        shouldRedirect = true
      }
    }
  } catch {
    // Ignore auth errors — show the waitlist page
  }

  if (shouldRedirect) {
    redirect("/agents")
  }

  return <PersonalAgentsWaitlistContent />
}
```

**Step 5: Update waitlist-content.tsx internal links**

In `frontend/app/agents/waitlist/waitlist-content.tsx`:
- Line 349: Change `href="/confidential-ai"` to `href="/chat"`
- Line 357: Change `href="/personal-agents"` to `href="/agents"`

**Step 6: Remove old workspace directory**

```bash
rm -rf frontend/app/agents/workspace
```

**Step 7: Verify structure**

```bash
ls -R frontend/app/agents/
```

Expected:
```
frontend/app/agents/:
layout.tsx  page.tsx  waitlist/

frontend/app/agents/waitlist:
page.tsx  waitlist-content.tsx
```

**Step 8: Commit**

```bash
git add -A && git commit -m "refactor(frontend): restructure /personal-agents to /agents with waitlist sub-route"
```

---

### Task 3: Add backward-compatible redirect routes

**Files:**
- Create: `frontend/app/confidential-ai/page.tsx` (redirect stub)
- Create: `frontend/app/personal-agents/page.tsx` (redirect stub)
- Create: `frontend/app/personal-agents/workspace/page.tsx` (redirect stub)

**Step 1: Create redirect for /confidential-ai**

Create `frontend/app/confidential-ai/page.tsx`:

```tsx
import { redirect } from "next/navigation"

export default function ConfidentialAiRedirect() {
  redirect("/chat")
}
```

**Step 2: Create redirect for /personal-agents**

Create `frontend/app/personal-agents/page.tsx`:

```tsx
import { redirect } from "next/navigation"

export default function PersonalAgentsRedirect() {
  redirect("/agents")
}
```

**Step 3: Create redirect for /personal-agents/workspace**

```bash
mkdir -p frontend/app/personal-agents/workspace
```

Create `frontend/app/personal-agents/workspace/page.tsx`:

```tsx
import { redirect } from "next/navigation"

export default function PersonalAgentsWorkspaceRedirect() {
  redirect("/agents")
}
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat(frontend): add backward-compatible redirects for old routes"
```

---

### Task 4: Update middleware route matchers

**Files:**
- Modify: `frontend/middleware.ts`

**Step 1: Update production fail-closed paths (lines 19-20)**

Change:
```ts
        pathname.startsWith("/confidential-ai") ||
        pathname.startsWith("/personal-agents/workspace")
```
To:
```ts
        pathname.startsWith("/chat") ||
        pathname.startsWith("/agents")
```

**Step 2: Update auth-required check (lines 51-52)**

Change:
```ts
    pathname.startsWith("/confidential-ai") ||
    pathname.startsWith("/personal-agents/workspace")
```
To:
```ts
    pathname.startsWith("/chat") ||
    pathname.startsWith("/agents")
```

Note: `/agents/waitlist` is public. Add an exclusion before the auth check:

After the pathname check on line 49, add:
```ts
  if (pathname.startsWith("/agents/waitlist")) {
    return response
  }
```

**Step 3: Verify middleware compiles**

```bash
cd frontend && pnpm build 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add -A && git commit -m "fix(frontend): update middleware route matchers for /chat and /agents"
```

---

### Task 5: Fix login redirect defaults (stay on current page)

**Files:**
- Modify: `frontend/app/auth/callback/route.ts:20`
- Modify: `frontend/app/sign-in/page.tsx:15-17`
- Modify: `frontend/components/google-oauth-button.tsx:20`
- Modify: `frontend/components/auth-dialog.tsx:105,140,229`
- Modify: `frontend/components/chunk-recovery.tsx:19`
- Modify: `frontend/components/workspace/workspace-provider.tsx:252,261`

**Step 1: Fix auth callback default fallback**

In `frontend/app/auth/callback/route.ts` line 20, change:
```ts
  const redirectPath = rawRedirect && rawRedirect.startsWith("/") ? rawRedirect : "/confidential-ai"
```
To:
```ts
  const redirectPath = rawRedirect && rawRedirect.startsWith("/") ? rawRedirect : "/"
```

**Step 2: Fix sign-in page sanitizeRedirect**

In `frontend/app/sign-in/page.tsx` lines 13-18, change:
```ts
function sanitizeRedirect(redirectParam: string | null) {
  if (!redirectParam) {
    return "/confidential-ai"
  }
  return redirectParam.startsWith("/") ? redirectParam : "/confidential-ai"
}
```
To:
```ts
function sanitizeRedirect(redirectParam: string | null) {
  if (!redirectParam) {
    return "/"
  }
  return redirectParam.startsWith("/") ? redirectParam : "/"
}
```

**Step 3: Fix Google OAuth button default**

In `frontend/components/google-oauth-button.tsx` line 20, change:
```ts
    const target = redirectTo ?? "/confidential-ai"
```
To:
```ts
    const target = redirectTo ?? "/"
```

**Step 4: Fix auth-dialog.tsx references**

In `frontend/components/auth-dialog.tsx`:
- Line 105: Change `router.push("/confidential-ai")` to `router.push("/chat")`
- Line 140: Change `next=/confidential-ai` to `next=/chat`
- Line 229: Change `redirectTo="/confidential-ai"` to `redirectTo="/chat"`

**Step 5: Fix chunk-recovery.tsx**

In `frontend/components/chunk-recovery.tsx` line 19, change:
```ts
    router.prefetch?.("/confidential-ai")
```
To:
```ts
    router.prefetch?.("/chat")
```

**Step 6: Fix workspace-provider.tsx auth redirects**

In `frontend/components/workspace/workspace-provider.tsx`:
- Line 252: Change `redirect=/confidential-ai` to `redirect=/chat`
- Line 261: Change `redirect=/confidential-ai` to `redirect=/chat`

**Step 7: Commit**

```bash
git add -A && git commit -m "fix(frontend): change login redirect default to stay on current page"
```

---

### Task 6: Update all navigation links

**Files:**
- Modify: `frontend/components/nav-auth-button.tsx:142,149`
- Modify: `frontend/components/workspace/user-menu.tsx:39,45`
- Modify: `frontend/app/page.tsx:230,557,634,637`
- Modify: `frontend/app/team/page.tsx:101`

**Step 1: Update nav-auth-button.tsx**

- Line 142: Change `href="/confidential-ai"` to `href="/chat"`
- Line 149: Change `href="/personal-agents"` to `href="/agents"`

**Step 2: Update user-menu.tsx**

- Line 39: Change `href="/confidential-ai"` to `href="/chat"`
- Line 45: Change `href="/personal-agents"` to `href="/agents"`

**Step 3: Update landing page (app/page.tsx)**

- Line 230: Change `router.push("/confidential-ai")` to `router.push("/chat")`
- Line 557: Change `href="/personal-agents"` to `href="/agents"`
- Line 634: Change `href="/confidential-ai"` to `href="/chat"`
- Line 637: Change `href="/personal-agents"` to `href="/agents"`

**Step 4: Update team page**

- Line 101: Change `href="/confidential-ai"` to `href="/chat"`

**Step 5: Commit**

```bash
git add -A && git commit -m "fix(frontend): update all navigation links to new routes"
```

---

### Task 7: Update admin waitlist activation redirect

**Files:**
- Modify: `frontend/app/api/admin/waitlist/[id]/activate/route.ts:73`

**Step 1: Update activation redirect**

Line 73: Change `redirect=/confidential-ai` to `redirect=/chat`

**Step 2: Commit**

```bash
git add -A && git commit -m "fix(frontend): update admin waitlist activation redirect"
```

---

### Task 8: Update E2E tests

**Files:**
- Modify: `frontend/tests/e2e/secure-chat.spec.ts:113-114`

**Step 1: Update test URL expectations**

- Line 113: Change `**/confidential-ai**` to `**/chat**`
- Line 114: Change `/\/confidential-ai(?:\?.*)?$/` to `/\/chat(?:\?.*)?$/`

**Step 2: Commit**

```bash
git add -A && git commit -m "test(frontend): update E2E tests for new /chat route"
```

---

### Task 9: Build verification

**Step 1: Run lint**

```bash
cd frontend && pnpm lint
```

Expected: No errors

**Step 2: Run build**

```bash
cd frontend && pnpm build
```

Expected: Build succeeds

**Step 3: Run unit tests**

```bash
cd frontend && pnpm test:unit
```

Expected: All pass

**Step 4: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix(frontend): address lint/build issues from route renaming"
```
