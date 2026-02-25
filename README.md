muss in den lokalen .node-red ordner geklont werden

Leitstelle simulieren: ```python3 client.py``` </br>

Node installieren: im Node-Red root verzeichnis ```npm i ./node-red-contrib-iec104``` </br>
Danach Node-Red (neu-)starten</br>
</br>

Voilà

# Implementieren

- GI Image und Buffer trennen
- GI Images werden in eine JSON geschrieben (Updateintervall einstellbar) - neue Daten zuerst in tmp schreiben (sicherer bei Geräteausfall/Strom weg etc), ggf unterschiede zum aktuellen Speicherstand parsen, falls kein Unterschied -> nicht schreiben

- Buffer mit Datenbank Option - ansonsten im Speicher, Speicheranzahl angeben
- GI Gruppen 


# Nodes in node red starten 


 compose up Befehl zum starten des NodeRed
 - Dockerfile lädt automatisch neue Nodes mit rein

 
