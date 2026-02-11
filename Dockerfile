FROM node:22.12.0

WORKDIR /app

# Install system dependencies that OpenClaw might need
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json ./

# Install OpenClaw globally
RUN npm install -g openclaw@latest

# Copy configuration files
COPY config ./config
COPY agents ./agents  
COPY workers ./workers

# Expose port (Railway handles this dynamically)
EXPOSE 8080

# Start OpenClaw gateway with our config via environment variable
ENV OPENCLAW_CONFIG_PATH=/app/config/hey-neighbor-config.json
CMD openclaw gateway --bind lan --port $PORT
