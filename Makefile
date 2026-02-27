# ABOUTME: Development task runner for Intel Briefing.
# ABOUTME: Use `make dev` to start both Next.js (8000) and NLP sidecar (8001).
.PHONY: dev build test nlp setup-nlp

# Start both Next.js (8000) and NLP sidecar (8001)
dev:
	@echo "Frontend → http://localhost:8000"
	@echo "NLP Sidecar → http://localhost:8001"
	@echo "Ctrl+C to stop\n"
	@cd nlp && uv run python run.py & NLP_PID=$$!; \
	trap "kill $$NLP_PID 2>/dev/null; exit" INT TERM; \
	cd frontend && npm run dev; \
	kill $$NLP_PID 2>/dev/null

# Start NLP sidecar only
nlp:
	cd nlp && uv run python run.py

# Download NLP models
setup-nlp:
	cd nlp && uv sync
	cd nlp && uv run python -m spacy download en_core_web_sm
	cd nlp && uv run python -m spacy download zh_core_web_sm
	cd nlp && uv run python -c "from nlp_sidecar.app import models; print('Models will download on first run')"

# Build frontend dist (for Docker deployment)
build:
	cd frontend && npm run build

# Run tests
test:
	cd frontend && npm test
	cd nlp && uv run pytest tests/ -v
