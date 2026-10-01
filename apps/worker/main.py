from __future__ import annotations

import io
import os
import zipfile
from functools import lru_cache
from typing import Annotated, Literal

from fastapi import FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response
from PIL import Image, ImageFilter, ImageOps
from rembg import new_session, remove

app = FastAPI(title="Zaxis KDP Image Worker", version="0.1.0")

MAX_UPLOAD_MB = int(os.getenv("ZAXIS_WORKER_MAX_UPLOAD_MB", "40"))
WORKER_TOKEN = os.getenv("ZAXIS_WORKER_TOKEN", "").strip()
DEFAULT_MODEL = os.getenv("ZAXIS_BG_MODEL", "birefnet-general").strip() or "birefnet-general"

ALLOWED_MODELS = {
    "birefnet-general",
    "birefnet-general-lite",
    "birefnet-portrait",
    "isnet-general-use",
    "u2net",
    "u2net_human_seg",
}


def require_auth(authorization: str | None) -> None:
    if not WORKER_TOKEN:
        return

    expected = f"Bearer {WORKER_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Worker authorization failed.")


@lru_cache(maxsize=6)
def session_for(model: str):
    if model not in ALLOWED_MODELS:
        raise ValueError(f"Unsupported background model: {model}")
    return new_session(model)


async def read_image(file: UploadFile) -> bytes:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=422, detail="Image file is empty.")

    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"Image exceeds {MAX_UPLOAD_MB} MB worker limit.",
        )

    try:
        image = Image.open(io.BytesIO(data))
        image.verify()
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Unsupported or invalid image.") from exc

    return data


def process_image(
    data: bytes,
    model: str,
    mode: Literal["fast", "quality", "hair"],
    only_mask: bool = False,
) -> bytes:
    try:
        session = session_for(model)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    kwargs = {
        "session": session,
        "only_mask": only_mask,
        "post_process_mask": mode != "fast",
        "force_return_bytes": True,
    }

    if not only_mask:
        if mode == "quality":
            kwargs["decontaminate"] = True
        elif mode == "hair":
            kwargs["vitmatte"] = True
            kwargs["decontaminate"] = True

    try:
        output = remove(data, **kwargs)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Background processing failed: {exc}") from exc

    if not isinstance(output, (bytes, bytearray)):
        raise HTTPException(status_code=500, detail="Worker returned an invalid image payload.")

    return bytes(output)


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "zaxis-kdp-image-worker",
        "version": "0.1.0",
        "default_model": DEFAULT_MODEL,
        "max_upload_mb": MAX_UPLOAD_MB,
        "auth_required": bool(WORKER_TOKEN),
    }


@app.post("/v1/image/upscale")
async def upscale_image(
    file: Annotated[UploadFile, File(...)],
    authorization: Annotated[str | None, Header()] = None,
    scale: Annotated[Literal[2, 4], Query()] = 2,
    cleanup: Annotated[bool, Query()] = True,
):
    require_auth(authorization)
    data = await read_image(file)

    try:
        image = Image.open(io.BytesIO(data)).convert("RGBA")
        target_width = image.width * scale
        target_height = image.height * scale

        if max(target_width, target_height) > 12000:
            raise HTTPException(
                status_code=422,
                detail="Upscaled image would exceed the 12000 px safety limit.",
            )

        alpha = image.getchannel("A")
        rgb = image.convert("RGB")

        if cleanup:
            rgb = ImageOps.autocontrast(rgb, cutoff=0.5)
            rgb = rgb.filter(
                ImageFilter.UnsharpMask(radius=1.4, percent=115, threshold=3)
            )

        rgb = rgb.resize(
            (target_width, target_height),
            Image.Resampling.LANCZOS,
        )
        alpha = alpha.resize(
            (target_width, target_height),
            Image.Resampling.LANCZOS,
        )

        output = Image.merge("RGBA", (*rgb.split(), alpha))
        buffer = io.BytesIO()
        output.save(buffer, format="PNG", optimize=True)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Upscale failed: {exc}") from exc

    return Response(
        content=buffer.getvalue(),
        media_type="image/png",
        headers={
            "X-Zaxis-Scale": str(scale),
            "X-Zaxis-Cleanup": "1" if cleanup else "0",
            "Cache-Control": "no-store",
        },
    )


@app.post("/v1/background/remove")
async def remove_background(
    file: Annotated[UploadFile, File(...)],
    authorization: Annotated[str | None, Header()] = None,
    mode: Annotated[Literal["fast", "quality", "hair"], Query()] = "quality",
    model: Annotated[str, Query()] = DEFAULT_MODEL,
):
    require_auth(authorization)
    data = await read_image(file)
    output = process_image(data, model=model, mode=mode, only_mask=False)

    return Response(
        content=output,
        media_type="image/png",
        headers={
            "X-Zaxis-Model": model,
            "X-Zaxis-Mode": mode,
            "Cache-Control": "no-store",
        },
    )


@app.post("/v1/background/mask")
async def background_mask(
    file: Annotated[UploadFile, File(...)],
    authorization: Annotated[str | None, Header()] = None,
    mode: Annotated[Literal["fast", "quality", "hair"], Query()] = "quality",
    model: Annotated[str, Query()] = DEFAULT_MODEL,
):
    require_auth(authorization)
    data = await read_image(file)
    output = process_image(data, model=model, mode=mode, only_mask=True)

    return Response(
        content=output,
        media_type="image/png",
        headers={
            "X-Zaxis-Model": model,
            "X-Zaxis-Mode": mode,
            "X-Zaxis-Output": "mask",
            "Cache-Control": "no-store",
        },
    )


@app.post("/v1/background/batch")
async def batch_remove_background(
    files: Annotated[list[UploadFile], File(...)],
    authorization: Annotated[str | None, Header()] = None,
    mode: Annotated[Literal["fast", "quality", "hair"], Query()] = "quality",
    model: Annotated[str, Query()] = DEFAULT_MODEL,
):
    require_auth(authorization)

    if not files:
        raise HTTPException(status_code=422, detail="At least one image is required.")

    if len(files) > 50:
        raise HTTPException(status_code=422, detail="Batch limit is 50 images.")

    archive = io.BytesIO()

    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for index, file in enumerate(files, start=1):
            data = await read_image(file)
            output = process_image(data, model=model, mode=mode, only_mask=False)
            base = os.path.splitext(file.filename or f"image-{index}")[0]
            safe = "".join(char if char.isalnum() or char in "-_" else "-" for char in base)
            zf.writestr(f"{safe or f'image-{index}'}-transparent.png", output)

    return Response(
        content=archive.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="zaxis-background-removed.zip"',
            "X-Zaxis-Model": model,
            "X-Zaxis-Mode": mode,
            "Cache-Control": "no-store",
        },
    )
