# Stage 1: Process OSRM data
FROM node:18-slim AS osrm-processor
WORKDIR /app
COPY package*.json ./
COPY forestry.lua ./
RUN npm install
RUN apt-get update && apt-get install -y curl lua5.2
RUN mkdir -p data
WORKDIR /app/data
RUN curl -O https://download.geofabrik.de/north-america/us/california-latest.osm.pbf
WORKDIR /app
RUN node_modules/@project-osrm/osrm/lib/binding/osrm-extract data/california-latest.osm.pbf -p forestry.lua
RUN node_modules/@project-osrm/osrm/lib/binding/osrm-contract data/california-latest
RUN rm data/california-latest.osm.pbf

# Stage 2: Build and run application
FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
COPY --from=osrm-processor /app/data ./data

EXPOSE 3000
CMD ["npm", "start"]