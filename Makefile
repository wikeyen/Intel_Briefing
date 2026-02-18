# ABOUTME: Development task runner for Intel Briefing.
# ABOUTME: Use `make dev` to start the Next.js dev server on port 8000.
.PHONY: dev build test

# Start Next.js dev server; Ctrl+C to stop
dev:
	@echo "Frontend → http://localhost:8000"
	@echo "Ctrl+C to stop\n"
	cd frontend && npm run dev

# Build frontend dist (for Docker deployment)
build:
	cd frontend && npm run build

# Run tests
test:
	cd frontend && npm test
