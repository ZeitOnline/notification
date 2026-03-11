# Überblick

- Dokutyp nach Diátaxis [Explanation](glossary.md#explanation)
- Name des Projektes mit Teaser
- Kurze Beschreibung Sinn und Zweck
- Wo kann man es im Einsatz sehen bzw ausprobieren?
- Am besten ein Diagramm als Systemübersicht und Anschaung über
    Interne und Externe Schnittstellen

<!---
Live Editor for Mermaid
    https://mermaid-js.github.io/mermaid-live-editor

 Ein Diagramm "ich und mein Umfeld", also das System "in der Mitte", und mit welchen anderen Systemen es wie zusammenarbeitet

 Tipp: Review des Kapitels durch Außenstehende !
-->

``` mermaid

    graph LR;
    client([client])-. Ingress-managed <br> load balancer .->ingress[Ingress];
    ingress-->|routing rule|service[Service];
    subgraph cluster
        ingress;
        service-->pod1[Pod];
        service-->pod2[Pod];
    end
    class ingress,service,pod1,pod2 k8s;
    class client plain;
    class cluster cluster;
```

## Kontakt
- Dokutyp nach Diátaxis [Reference](glossary.md#reference)

- Wer ist für das Projekt verantwortlich?
  - Welches Team, evtl Hauptansprechparter:in für das Projekt
  - PO
  - Der für das Projekt geeignetste #slack-channel?

  - Falls *Externer Dienstleister* dann genaue Kontaktdaten mit
    Ansprechpartner, E-Mail, Telefonnummer, Vereinbarte
    Servicezeiten/Supportverträge (24/7 Erreichbarkeit oder nur
    bestimmte Werktage)
