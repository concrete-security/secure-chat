# Saas Landing Page

*Automatically synced with your [v0.app](https://v0.app) deployments*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/jordanfrery-3725s-projects/v0-saas-landing-page)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app/chat/projects/o951Eo6uxDK)

## Overview

This repository will stay in sync with your deployed chats on [v0.app](https://v0.app).
Any changes you make to your deployed app will be automatically pushed to this repository from [v0.app](https://v0.app).

## Deployment

Your project is live at:

**[https://vercel.com/jordanfrery-3725s-projects/v0-saas-landing-page](https://vercel.com/jordanfrery-3725s-projects/v0-saas-landing-page)**

## Build your app

Continue building your app on:

**[https://v0.app/chat/projects/o951Eo6uxDK](https://v0.app/chat/projects/o951Eo6uxDK)**

## How It Works

1. Create and modify your project using [v0.app](https://v0.app)
2. Deploy your chats from the v0 interface
3. Changes are automatically pushed to this repository
4. Vercel deploys the latest version from this repository

## How to launch it

- Go to: `cd ~/secure-llm/frontend`
- Install the dependancies: `pnpm install`
- Launch the project: `pnpm dev --hostname 0.0.0.0`
- Check if the port 3000 is used: `sudo ss -ltnp | grep 3000`
- You should see:

```
 Next.js 15.5.4
- Local:    http://localhost:3000
- Network:  http://10.0.0.182:3000
✓ Ready in xxms
 ○ Compiling / ...
 ✓ Compiled / in xxs (xx modules)
 GET / 200 in xxms
 ✓ Compiled in xxms (xx modules)
```

- For `Node/Next.jsa` dependancies are added to : `package.json` through `npm install openai`

## Configuration

Copy the example environment file and adjust it for your deployment:

- `cp .env.local.example .env.local`
- Verify the `VLLM_BASE_URL`/`NEXT_PUBLIC_VLLM_BASE_URL` values point to your vLLM OpenAI-compatible endpoint. The included `http://69.19.137.239:8000/v1` target assumes the daemon is listening on port 8000; update the URL if your deployment exposes a different port or protocol.
- Keep the `VLLM_API_KEY` secret. The provided `token-` value is required for the remote image shared above – replace it if you rotate credentials.
- Run `curl -H "Authorization: Bearer token-" http://69.19.137.239:8000/v1/models` (or the equivalent for your URL) to discover the available model id and update `VLLM_MODEL`/`NEXT_PUBLIC_VLLM_MODEL` accordingly.
- Update the base system prompt in `lib/system-prompt.ts` if you need a different Umbra persona. You can still override it per deployment with the `DEFAULT_SYSTEM_PROMPT` environment variable.
- Umbra now allows you to pick a reasoning intensity (low/medium/high) in the chat UI; the selection is forwarded via `reasoning_effort` to the vLLM OpenAI-compatible endpoint, so ensure your backend model accepts the corresponding parameter.

The Next.js API route reads the server-side variables (`VLLM_*`, `DEFAULT_*`) while the UI surfaces connection details using the public `NEXT_PUBLIC_VLLM_*` keys.
