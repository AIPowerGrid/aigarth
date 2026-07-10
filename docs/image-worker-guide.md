# Image and video worker quick guide

Use `grid-media-worker` to connect ComfyUI to the Grid. Older repository names
such as `comfy-bridge` may redirect, but the canonical repository is:
`https://github.com/AIPowerGrid/grid-media-worker`.

## Quick start

1. Run ComfyUI locally, normally at `http://127.0.0.1:8188`.
2. Create a Grid key at `https://console.aipowergrid.io/dashboard/api-key`.
3. Install the worker:

```bash
git clone https://github.com/AIPowerGrid/grid-media-worker
cd grid-media-worker
python -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
```

4. Configure the current WebSocket transport:

```ini
GRID_API_KEY=grid_your_key
GRID_API_URL=https://api.aipowergrid.io
GRID_WS=true
COMFYUI_URL=http://127.0.0.1:8188
GRID_WORKER_NAME=my-media-worker
```

5. Run `comfy-bridge`, open the local control UI on port 7860, and verify that
   only models with resolvable workflows are advertised.
6. Set the account's Base payout wallet in the developer console.

The Grid pushes image/video jobs through `/v1/workers/ws` and gives the worker
presigned upload slots. Workers should not hold standing R2 credentials. Current
models and parameter limits come from Grid policy and connected workers; query
the live model/status endpoints instead of relying on static lists.
