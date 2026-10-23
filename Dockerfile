# The server needs Python (serve.py, the staff portal) and Node 18+ (the pack check that runs
# before anything is published). Neither needs any packages beyond its standard library.
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends nodejs && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
ENV PYTHONUNBUFFERED=1
CMD ["python", "serve.py"]
