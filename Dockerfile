FROM nodered/node-red:latest

# Paket (alle Nodes + lib + weitere Dateien) ins Image kopieren
COPY node-red-contrib-iec104 /usr/src/node-red/node-red-contrib-iec104

# Paket installieren -> Node-RED sieht danach ALLE nodes aus package.json "node-red.nodes"
RUN cd /usr/src/node-red && npm install ./node-red-contrib-iec104 --unsafe-perm --no-update-notifier --no-fund
