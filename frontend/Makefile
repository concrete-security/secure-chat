# Quick dev workflow for Confidential AI landing page

PORT ?= 3000
FORM_TOKEN_SECRET ?= local-form-token

.PHONY: help install dev dev-https dev-open dev-open-https open open-when-ready build start lint clean test

help:
	@echo "Make targets:"
	@echo "  make install          # Install deps (pnpm or npm)"
	@echo "  make dev              # Run HTTP dev server on PORT=$(PORT)"
	@echo "  make dev-https        # Run HTTPS dev server (passkeys & CVM)"
	@echo "  make dev-open         # HTTP dev + auto-open browser"
	@echo "  make dev-open-https   # HTTPS dev + auto-open browser"
	@echo "  make open             # Open in browser (defaults to HTTPS)"
	@echo "  make build            # Production build"
	@echo "  make start            # Start production server on PORT=$(PORT)"
	@echo "  make lint             # Run linter"
	@echo "  make test             # Run unit + Playwright tests (used in CI)"
	@echo "  make clean            # Remove .next build output"

install:
	@if command -v pnpm >/dev/null 2>&1; then pnpm install; else npm install; fi

dev:
	@if command -v pnpm >/dev/null 2>&1; then PORT=$(PORT) pnpm dev; else PORT=$(PORT) npm run dev -- -p $(PORT); fi

dev-https:
	@if command -v pnpm >/dev/null 2>&1; then PORT=$(PORT) pnpm dev:https; else PORT=$(PORT) npm run dev:https; fi

# Start dev server and open the browser when it's reachable
dev-open:
	@DEV_URL="http://localhost:$(PORT)" $(MAKE) open-when-ready -s &
	@$(MAKE) dev -s

dev-open-https:
	@DEV_URL="https://localhost.concrete-security.com:$(PORT)" $(MAKE) open-when-ready -s &
	@$(MAKE) dev-https -s

open-when-ready:
	@echo "Waiting for $(DEV_URL) ..."; \
	until curl -ksSf "$(DEV_URL)" >/dev/null 2>&1; do sleep 1; done; \
	DEV_URL="$(DEV_URL)" $(MAKE) open -s

open:
	@URL="$${DEV_URL:-https://localhost.concrete-security.com:$(PORT)}"; \
	if command -v open >/dev/null 2>&1; then open "$$URL"; \
	elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$$URL"; \
	elif command -v powershell.exe >/dev/null 2>&1; then powershell.exe -NoProfile -Command Start-Process "$$URL"; \
	else printf "Open manually: $$URL\n"; fi

build:
	@if command -v pnpm >/dev/null 2>&1; then pnpm build; else npm run build; fi

start:
	@if command -v pnpm >/dev/null 2>&1; then PORT=$(PORT) pnpm start; else PORT=$(PORT) npm run start; fi

lint:
	@if command -v pnpm >/dev/null 2>&1; then pnpm lint; else npm run lint; fi

test test-ci:
	@if command -v pnpm >/dev/null 2>&1; then \
		echo "Running unit tests with vitest..."; \
		FORM_TOKEN_SECRET=$(FORM_TOKEN_SECRET) pnpm test:unit && \
		echo "Running Playwright E2E suite..."; \
		NEXT_PUBLIC_ATTESTATION_TEST_MODE=true FORM_TOKEN_SECRET=$(FORM_TOKEN_SECRET) pnpm test:e2e; \
	else \
		echo "Running unit tests with npm..."; \
		FORM_TOKEN_SECRET=$(FORM_TOKEN_SECRET) npm run test:unit && \
		echo "Running Playwright E2E suite with npm..."; \
		NEXT_PUBLIC_ATTESTATION_TEST_MODE=true FORM_TOKEN_SECRET=$(FORM_TOKEN_SECRET) npm run test:e2e; \
	fi

clean:
	rm -rf .next
