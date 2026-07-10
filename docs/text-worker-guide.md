# Text worker quick guide

Use the current `grid-text-worker`; older `text-worker-bridge` and OmniForge
instructions are not the supported Grid path.

## Quick start

1. Create a key at `https://console.aipowergrid.io/dashboard/api-key`.
2. Install a local backend. Ollama is the easiest first run; vLLM or SGLang are
   better fits for high-throughput servers.
3. Download a release from
   `https://github.com/AIPowerGrid/grid-text-worker/releases`, or run from source:

```bash
git clone https://github.com/AIPowerGrid/grid-text-worker
cd grid-text-worker
python -m venv .venv
source .venv/bin/activate
pip install -e .
grid-inference-worker
```

4. Open `http://localhost:7861`, enter the Grid key, choose the backend/model,
   and start the worker.
5. Set the account's Base payout wallet in the developer console.

## Core configuration

```ini
GRID_API_KEY=grid_your_key
GRID_API_URL=https://api.aipowergrid.io
GRID_STREAMING=true
BACKEND_TYPE=ollama
OLLAMA_URL=http://127.0.0.1:11434
MODEL_NAME=llama3.2:3b
GRID_WORKER_NAME=my-text-worker
```

The current transport is `/v1/workers/ws`. Do not configure `/api/v2`, Horde
poll endpoints, or a worker-private payout key.

Models online and demand change. Check `/v1/models` and the console instead of
assuming a static model or earnings estimate.
