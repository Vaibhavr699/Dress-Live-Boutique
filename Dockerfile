# Root-level Dockerfile for the RunPod Hub build.
#
# CatVTON virtual try-on worker. Built on a CUDA 12.1 base because that's
# what torch==2.1.2 + xformers==0.0.23.post1 are pinned against. The image
# is ~9–10GB once everything is installed; bump containerDiskInGb in
# .runpod/hub.json if you change this.
#
# Cold-start budget on a fresh worker:
#   • Image pull:                       ~30–60s (one-time per worker)
#   • CatVTON weights baked into image:  0s     (pre-pulled at build time)
#   • SD-inpainting base (HF download):  ~30–60s on first request only
#                                        (cached on worker disk after)
#   • Pipeline init + CUDA warmup:       ~10–20s
# After the first call, warm requests are ~1.5–3s on RTX 4090.
#
# To skip the SD download on first request entirely, uncomment the
# pre-pull RUN block at the bottom — image grows to ~14GB but cold
# starts drop to ~10s. Trade-off: bigger image storage cost.

FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/hf-cache \
    HUGGINGFACE_HUB_CACHE=/opt/hf-cache

# System deps. libgl + libglib are required by opencv-python-headless and
# mediapipe at runtime; git is used to fetch CatVTON source (no PyPI pkg).
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.10 \
        python3.10-venv \
        python3-pip \
        git \
        libgl1 \
        libglib2.0-0 \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.10 /usr/bin/python \
    && ln -sf /usr/bin/python3.10 /usr/bin/python3

WORKDIR /app

# Pin to a specific CatVTON commit so future upstream changes don't break
# our handler's import paths. Update the SHA when you deliberately bump.
ARG CATVTON_COMMIT=main
RUN git clone https://github.com/Zheng-Chong/CatVTON.git /opt/catvton && \
    cd /opt/catvton && \
    git checkout ${CATVTON_COMMIT} && \
    rm -rf /opt/catvton/.git
ENV PYTHONPATH="/opt/catvton:${PYTHONPATH}"

COPY runpod-worker/requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && \
    pip install -r /app/requirements.txt

# Pre-pull CatVTON's attention weights (~1GB) so the first cold call
# doesn't pay for the network fetch.
RUN python -c "from huggingface_hub import snapshot_download; \
    snapshot_download(repo_id='zhengchong/CatVTON', local_dir='/opt/models/catvton', local_dir_use_symlinks=False)"

# Pre-pull SD inpainting base. Required for fast cold starts — downloading
# at runtime pushed the worker's first-ready time past RunPod's test deadline.
#
# Switched from `booksforcharlie/stable-diffusion-inpainting` (community mirror
# that ships .bin pickles only) to `stable-diffusion-v1-5/stable-diffusion-
# inpainting` (the canonical replacement-mirror after RunwayML pulled the
# original; ships .safetensors). Diffusers/CatVTON's loader was failing with
# "no file named diffusion_pytorch_model.safetensors found in directory".
#
# allow_patterns is deliberately strict — only safetensors weights + config
# files. Two benefits: (1) skips the duplicate .bin weights so the image
# stays ~3GB smaller, (2) fails the build immediately if the new repo ever
# drops its safetensors variants, instead of silently shipping a broken
# image that surfaces the error only at runtime.
RUN python -c "from huggingface_hub import snapshot_download; \
    snapshot_download(repo_id='stable-diffusion-v1-5/stable-diffusion-inpainting', \
                      local_dir='/opt/models/sd-inpainting', \
                      local_dir_use_symlinks=False, \
                      allow_patterns=['*.json', '*.txt', '*.safetensors'])"

# Sanity-check the download produced the file CatVTON's loader expects.
# Fails the build loud rather than letting a broken image reach RunPod.
RUN test -f /opt/models/sd-inpainting/unet/diffusion_pytorch_model.safetensors \
    || (echo "ERROR: SD-inpainting safetensors missing after snapshot_download" && exit 1)

ENV CATVTON_BASE_MODEL=/opt/models/sd-inpainting \
    CATVTON_ATTN_REPO=/opt/models/catvton

COPY runpod-worker/handler.py /app/handler.py

CMD ["python", "-u", "/app/handler.py"]
