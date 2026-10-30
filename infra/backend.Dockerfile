FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend

WORKDIR /app/backend

# Fixed UID/GID, the images directory on the host must be owned by it (see docker-compose.prod.yml)
RUN groupadd -r -g 999 app && useradd -r -u 999 -g app app

# NudeNet's 640m model for the nudity check of uploaded images (app/core/nudity_filter.py), the asset 640m.onnx of the
# v3.4-weights release of github.com/notAI-tech/NudeNet. Downloaded through the API, since the release's download link
# may answer with a sign-in page, and checked against its hash. Before the requirements, so that the 100 MB download
# stays cached when they change.
ARG NUDENET_MODEL_URL=https://api.github.com/repos/notAI-tech/NudeNet/releases/assets/176832019
ARG NUDENET_MODEL_SHA256=04fe3d77980780c1f8297dc6d7f942fd5b3abe6942a188f742a85241e4f634eb
RUN mkdir -p /opt/nudenet \
    && python -c "import shutil, sys, urllib.request; \
request = urllib.request.Request(sys.argv[1], headers={'Accept': 'application/octet-stream'}); \
shutil.copyfileobj(urllib.request.urlopen(request, timeout=60), open('/opt/nudenet/640m.onnx', 'wb'))" "$NUDENET_MODEL_URL" \
    && echo "$NUDENET_MODEL_SHA256  /opt/nudenet/640m.onnx" | sha256sum -c -

COPY backend/requirements.txt ./requirements.txt

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app

# Mount point of the images volume, a new named volume takes over this ownership
RUN mkdir -p /data/images && chown -R app:app /app /data/images

USER app

EXPOSE 5000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000"]
