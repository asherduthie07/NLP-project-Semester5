FROM python:3.13.2-slim
WORKDIR /app
# The research image targets Linux x86_64; CUDA/MPS use a native installation.
# Keep the large wheel layer reusable if a subsequent dependency download fails.
RUN --mount=type=cache,target=/root/.cache/pip pip install --timeout 60 --no-deps 'https://download.pytorch.org/whl/cpu/torch-2.6.0%2Bcpu-cp313-cp313-linux_x86_64.whl#sha256=e70ee2e37ad27a90201d101a41c2e10df7cf15a9ebd17c084f54cf2518c57bdf'
COPY nlp/requirements.lock /app/requirements-nlp.txt
RUN --mount=type=cache,target=/root/.cache/pip pip install --timeout 60 -r requirements-nlp.txt && pip check
COPY nlp /app/nlp
COPY experiments /app/experiments
ENV HF_HUB_DISABLE_TELEMETRY=1 HF_XET_CACHE=/app/storage/xet-cache TOKENIZERS_PARALLELISM=false
CMD ["python", "-m", "experiments.phase4", "--help"]
