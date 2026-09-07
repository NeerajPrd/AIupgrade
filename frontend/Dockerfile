# Use Node.js as base image (Next.js 16 requires Node >=20.9)
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install dependencies from the exact versions already resolved in package-lock.json.
# --legacy-peer-deps: ollama-ai-provider@1.2.0 peers on zod@^3, but the lockfile
# already dedupes the whole tree onto zod@4.4.3 (pulled in by @ai-sdk/*); this just
# accepts that already-locked resolution instead of npm re-validating peer ranges.
RUN npm ci --legacy-peer-deps

# Copy the entire project
COPY . .

# Browser-facing API URL, baked into the client bundle at build time.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_WEBSOCKET_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_WEBSOCKET_URL=$NEXT_PUBLIC_WEBSOCKET_URL

# Build the Next.js app
RUN npm run build

# Expose the port (use the port that Next.js is set to run on)
EXPOSE 8080

# Set the environment variable for the port (optional, but ensures PORT is set)
ENV PORT=8080

# Start the Next.js app
CMD ["npm", "run", "start"]
