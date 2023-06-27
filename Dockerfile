FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install

# Copy source code & resources
COPY src ./src
COPY res ./res

# Build the project
RUN npm run build

CMD [ "npm", "run", "start" ]
