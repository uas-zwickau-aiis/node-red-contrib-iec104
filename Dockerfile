FROM nodered/node-red:latest

# Copy package into the image
COPY . /usr/src/node-red/node-red-contrib-iec104

# Install the package so Node-RED picks up all nodes from package.json "node-red.nodes"
RUN cd /usr/src/node-red && npm install ./node-red-contrib-iec104 --unsafe-perm --no-update-notifier --no-fund
