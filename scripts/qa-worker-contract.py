from __future__ import annotations

import importlib.util
import io
import sys
import types
from pathlib import Path

from fastapi import HTTPException
from PIL import Image

calls: list[dict] = []


def fake_new_session(model: str):
    return {"model": model}


def fake_remove(data: bytes, **kwargs):
    calls.append(dict(kwargs))
    source = Image.open(io.BytesIO(data))

    if kwargs.get("only_mask"):
        output = Image.new("L", source.size, 255)
    else:
        output = source.convert("RGBA")
        alpha = Image.new("L", source.size, 255)
        # Make the first column transparent so the test proves alpha survives.
        for y in range(source.height):
            alpha.putpixel((0, y), 0)
        output.putalpha(alpha)

    buffer = io.BytesIO()
    output.save(buffer, format="PNG")
    return buffer.getvalue()


fake_rembg = types.ModuleType("rembg")
fake_rembg.new_session = fake_new_session
fake_rembg.remove = fake_remove
sys.modules["rembg"] = fake_rembg

worker_path = Path(__file__).resolve().parents[1] / "apps" / "worker" / "main.py"
spec = importlib.util.spec_from_file_location("zaxis_worker_qa", worker_path)
if spec is None or spec.loader is None:
    raise RuntimeError("Could not load worker module.")

worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def fixture_png() -> bytes:
    image = Image.new("RGB", (8, 6), (220, 30, 40))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def inspect_png(data: bytes):
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


source = fixture_png()

calls.clear()
fast = worker.process_image(source, model="u2net", mode="fast", only_mask=False)
fast_call = calls[-1]
fast_image = inspect_png(fast)
expect(fast_image.size == (8, 6), "Fast mode changed output dimensions.")
expect(fast_image.mode == "RGBA", "Fast mode must return alpha-capable PNG output.")
expect(fast_image.getchannel("A").getpixel((0, 0)) == 0, "Fast mode lost transparency.")
expect(fast_call["post_process_mask"] is False, "Fast mode unexpectedly post-processed mask.")
expect("decontaminate" not in fast_call, "Fast mode enabled edge decontamination.")
expect("vitmatte" not in fast_call, "Fast mode enabled ViTMatte.")

calls.clear()
quality = worker.process_image(source, model="birefnet-general", mode="quality", only_mask=False)
quality_call = calls[-1]
quality_image = inspect_png(quality)
expect(quality_image.size == (8, 6), "Quality mode changed output dimensions.")
expect(quality_call["post_process_mask"] is True, "Quality mode must post-process mask.")
expect(quality_call.get("decontaminate") is True, "Quality mode must enable decontamination.")
expect("vitmatte" not in quality_call, "Quality mode should not force ViTMatte.")

calls.clear()
hair = worker.process_image(source, model="birefnet-portrait", mode="hair", only_mask=False)
hair_call = calls[-1]
expect(hair_call["post_process_mask"] is True, "Hair mode must post-process mask.")
expect(hair_call.get("decontaminate") is True, "Hair mode must enable decontamination.")
expect(hair_call.get("vitmatte") is True, "Hair mode must enable ViTMatte.")

calls.clear()
mask = worker.process_image(source, model="isnet-general-use", mode="quality", only_mask=True)
mask_call = calls[-1]
mask_image = inspect_png(mask)
expect(mask_image.size == (8, 6), "Mask output changed dimensions.")
expect(mask_call["only_mask"] is True, "Mask request did not pass only_mask.")
expect(mask_call["post_process_mask"] is True, "Quality mask must be post-processed.")
expect("decontaminate" not in mask_call, "Mask-only path should not decontaminate RGB edges.")
expect("vitmatte" not in mask_call, "Mask-only path should not request ViTMatte.")

try:
    worker.process_image(source, model="unsupported-model", mode="quality", only_mask=False)
    raise RuntimeError("Unsupported model should have failed.")
except HTTPException as exc:
    expect(exc.status_code == 422, "Unsupported model did not return HTTP 422.")

original_token = worker.WORKER_TOKEN
worker.WORKER_TOKEN = "phase4-secret"
try:
    try:
        worker.require_auth(None)
        raise RuntimeError("Missing worker token should fail.")
    except HTTPException as exc:
        expect(exc.status_code == 401, "Missing worker token did not return HTTP 401.")

    worker.require_auth("Bearer phase4-secret")
finally:
    worker.WORKER_TOKEN = original_token

expect(
    {"birefnet-general", "birefnet-general-lite", "birefnet-portrait", "isnet-general-use", "u2net", "u2net_human_seg"}
    <= worker.ALLOWED_MODELS,
    "Expected production background models are missing."
)

print(
    {
        "ok": True,
        "dimensions": fast_image.size,
        "fast_post_process": fast_call["post_process_mask"],
        "quality_decontaminate": quality_call.get("decontaminate"),
        "hair_vitmatte": hair_call.get("vitmatte"),
        "mask_mode": mask_image.mode,
        "auth_guard": True,
    }
)
