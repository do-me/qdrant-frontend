# Qdrant Frontend
A universal Qdrant table frontend based on transformers.js

![image](https://github.com/do-me/qdrant-frontend/assets/47481567/2a89b77b-8298-488c-8718-2ad760f43fa6)

## Usage 
Simply go to https://do-me.github.io/qdrant-frontend/ and type in your Qdrant URL: 
- On localhost: http://localhost:6333/collections/yourcollection
- Remote connection: http://yourserver.com:6333/collections/yourcollection
In the latter case make sure that your reverse proxy (nginx, caddy etc.) is configured to allow CORS. 

Choose the model you used in the collection (unfortunately afaik there is no collectiopn metadata property for this yet) and decide whether you want to use smaller models (quantized) or larger but accurate models.
Enter your search query and a row limit.

Note that you can just bookmark the URL so that all input fields are filled out for you next time!

## Idea 
The model is loaded to your browser with transformers.js so your search query gets inferenced on the fly. The resulting vector is then used in the Qdrant search query.

## Motivation 
Qdrant's Web-UI is great but unfortunately it still requires an additional server for inferencing as Qdrant's fastembed is not yet integrated in a convenient way [1](https://github.com/qdrant/fastembed/discussions/117), [2](https://github.com/qdrant/qdrant-web-ui/issues/162). This static page is supposed to provide a minimalistic interface for quickly querying Qdrant collections. 

## Installation
If you want to develop or build locally clone the repo and run: 
- `npm install`
- `npm run start` for development or
- `npm run build` for a local build resulting in an index.html and index.js file you can deploy anywhere.

## To Do 
- Improve UI
- Use Qdrant JS client instead of hardcoding the request
- Testing
- Add dimenstionality reduction feature based on bhtsne-wasm for the top results like in https://do-me.github.io/SemanticFinder/

PR's very welcome!
