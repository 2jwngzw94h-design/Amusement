# Webapp Leaflet + ESRI Feature Service

Application cartographique légère qui consomme le service ArcGIS

## Lancer en local

```bash
python3 -m http.server 4173
```

Puis ouvrir `http://localhost:4173`.

## Fonctionnalités

- Carte Leaflet avec fond OpenStreetMap.
- Chargement dynamique des couches de type **Feature Layer** depuis le MapServer.
- Panneau gauche de filtres généré automatiquement depuis les attributs détectés.
- Filtre texte global + filtres de champs spécifiques.
- Requête ArcGIS `query` avec clause `where` reconstruite à chaque interaction.
- Design visuel basé sur Bootstrap + Atlassian Design for Bootstrap.
