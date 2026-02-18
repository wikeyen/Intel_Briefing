# ABOUTME: Development task runner for Intel Briefing.
# ABOUTME: Use `make dev` to start backend + frontend dev servers together.
.PHONY: dev build

# Start both servers; Ctrl+C kills both
dev:
	@echo "Frontend → http://localhost:8000"
	@echo "Backend  → http://localhost:8001 (internal)"
	@echo "Ctrl+C to stop both\n"
	@trap 'kill 0' SIGINT; \
		DEV_PROXY_SECRET=intel-briefing-dev uv run uvicorn intel_briefing.api.main:app --reload --host 127.0.0.1 --port 8001 & \
		cd frontend && BACKEND_URL=http://127.0.0.1:8001 DEV_PROXY_SECRET=intel-briefing-dev npm run dev

# Build frontend dist (for Docker deployment)
build:
	cd frontend && npm run build
