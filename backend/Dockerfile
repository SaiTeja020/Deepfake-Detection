FROM python:3.10-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Install system dependencies required for OpenCV
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy the rest of the application code
COPY . .
RUN chmod +x /app/entrypoint.sh

ENV UV_CACHE_DIR=/root/.cache/uv
ENV VIRTUAL_ENV=/app/.venv
ENV PATH="/app/.venv/bin:/root/.local/bin:${PATH}"

# Expose Flask default port
EXPOSE 5000

# Install dependencies and run Flask application
ENTRYPOINT ["sh", "-c", "sed -i 's/\\r$//' /app/entrypoint.sh && exec sh /app/entrypoint.sh \"$@\"", "--"]
CMD ["python", "app.py"]
