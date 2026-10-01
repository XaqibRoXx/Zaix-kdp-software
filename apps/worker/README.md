# Zaxis KDP Image Worker

Phase 3 image-processing worker for background removal.

## Endpoints
- `GET /health`
- `POST /v1/background/remove` — transparent PNG
- `POST /v1/background/mask` — grayscale mask for manual refine workflows
- `POST /v1/background/batch` — ZIP of transparent PNG files

## Modes
- `fast` — minimal post-processing
- `quality` — mask post-processing + edge color decontamination
- `hair` — ViTMatte soft-edge refinement for hair/fur/detail

## Model
Default: `birefnet-general`.

Supported selectable models:
- `birefnet-general`
- `birefnet-general-lite`
- `birefnet-portrait`
- `isnet-general-use`
- `u2net`
- `u2net_human_seg`

Model weights are downloaded by rembg on first use. Model weights can have licenses separate from the rembg package, so deployment owners must review the selected model's license for their use case.

## Environment
```
ZAXIS_WORKER_TOKEN=long-random-secret
ZAXIS_BG_MODEL=birefnet-general
ZAXIS_WORKER_MAX_UPLOAD_MB=40
```

When `ZAXIS_WORKER_TOKEN` is set, image endpoints require:

```
Authorization: Bearer <token>
```

## Run
```
python -m venv .venv
.venv/Scripts/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8080
```

The worker is optional and can run on a VPS, dedicated server, or a sufficiently capable local machine. The PHP/cPanel API remains the control plane.
