FROM node:22.12.0-slim

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies and OpenClaw
RUN npm install -g openclaw@latest

# Copy configuration files
COPY config ./config
COPY agents ./agents  
COPY workers ./workers

# Expose port
EXPOSE $PORT

# Start OpenClaw gateway
CMD ["openclaw", "gateway", "--allow-unconfigured", "--bind", "0.0.0.0", "--port", "$PORT"]
