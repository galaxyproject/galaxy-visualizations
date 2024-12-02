import { Vitessce } from 'vitessce';

const myViewConfig = {
    version: "1.0.4",
    name: "My example config",
    description: "This demonstrates the JSON schema",
    datasets: [
      {
        uid: "D1",
        name: "Dries",
        files: [
          {
            url: "https://data-1.vitessce.io/0.0.31/master_release/dries/dries.cells.json",
            type: "cells",
            fileType: "cells.json"
          },
          {
            url: "https://data-1.vitessce.io/0.0.31/master_release/dries/dries.cell-sets.json",
            type: "cell-sets",
            fileType: "cell-sets.json"
          }
        ]
      }
    ],
    coordinationSpace: {
      dataset: {
        A: "D1"
      },
      embeddingType: {
        A: "UMAP",
        B: "t-SNE"
      },
      embeddingZoom: {
        A: 2.5
      }
    },
    layout: [
      {
        component: "scatterplot",
        coordinationScopes: {
          dataset: "A",
          embeddingType: "A",
          embeddingZoom: "A"
        },
        x: 6, y: 0, w: 6, h: 6
      },
      {
        component: "scatterplot",
        coordinationScopes: {
          dataset: "A",
          embeddingType: "B",
          embeddingZoom: "A"
        },
        x: 0, y: 0, w: 6, h: 6
      },
      {
        component: "cellSets",
        coordinationScopes: {
          dataset: "A"
        },
        x: 0, y: 6, w: 6, h: 6
      },
      {
        component: "cellSetSizes",
        coordinationScopes: {
          dataset: "A"
        },
        x: 6, y: 6, w: 6, h: 6
      }
    ],
    initStrategy: "auto"
  };
  
function App() {
    return (
        <>
            <Vitessce
                config={myViewConfig}
                theme="light"
            />
        </>
    );
}

export default App;
