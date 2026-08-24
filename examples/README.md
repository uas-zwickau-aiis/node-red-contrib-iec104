# Install Dependencies

sudo apt install python3-venv

python3 -m venv ~/c104-venv
source ~/c104-venv/bin/activate

pip install c104

# Run 

## Client

python3 client.py cconfig.json

## Server

python3 server.py sconfig.json