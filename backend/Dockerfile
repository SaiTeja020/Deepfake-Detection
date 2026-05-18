FROM python:3.10-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Install system dependencies required for OpenCV
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libusb-1.0-0 \
    libnss3 \
    && rm -rf /var/lib/apt/lists/*

# Optimize: Copy requirements first to leverage Docker layer caching
COPY requirements.txt .

# Create virtual environment and install dependencies during build
ENV VIRTUAL_ENV=/app/.venv
RUN uv venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Pre-install dependencies (using CPU torch to keep image size manageable)
RUN uv pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

# Copy the rest of the application code
COPY . .
RUN chmod +x /app/entrypoint.sh

ENV UV_CACHE_DIR=/root/.cache/uv
ENV PATH="/app/.venv/bin:/root/.local/bin:${PATH}"

# Expose Flask default port
EXPOSE 5000

# Install dependencies and run Flask application
ENTRYPOINT ["sh", "-c", "sed -i 's/\\r$//' /app/entrypoint.sh && exec sh /app/entrypoint.sh \"$@\"", "--"]
CMD ["python", "app.py"]
