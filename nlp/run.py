# ABOUTME: Entry point for the NLP sidecar server.
# ABOUTME: Starts uvicorn on the configured port with auto-reload in dev mode.
import uvicorn

from nlp_sidecar.config import PORT

if __name__ == "__main__":
    uvicorn.run("nlp_sidecar.app:app", host="127.0.0.1", port=PORT, reload=True)
