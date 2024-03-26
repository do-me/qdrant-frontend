import init, { tSNE } from "wasm-bhtsne";

init();
let queryEmbedding

function convertFloat32ArraysToArrays(arrayOfFloat32Arrays) {
    return arrayOfFloat32Arrays.reduce((accumulator, currentFloat32Array) => {
        // Convert Float32Array to a regular JavaScript array using Array.from
        const jsArray = Array.from(currentFloat32Array);

        // Add the converted array to the accumulator
        accumulator.push(jsArray);

        return accumulator;
    }, []);
}

function calculateCosineSimilarity(embedding) {
    let dotProduct = 0;
    let queryMagnitude = 0;
    let embeddingMagnitude = 0;
    const queryEmbeddingLength = queryEmbedding.length;

    for (let i = 0; i < queryEmbeddingLength; i++) {
        dotProduct += queryEmbedding[i] * embedding[i];
        queryMagnitude += queryEmbedding[i] ** 2;
        embeddingMagnitude += embedding[i] ** 2;
    }

    return dotProduct / (Math.sqrt(queryMagnitude) * Math.sqrt(embeddingMagnitude));
}

self.onmessage = async (event) => {
    const message = event.data;
    switch (message.type) {
        case 'tsne':
            const start = performance.now();
            queryEmbedding = message.data.queryEmbedding;
            
            //data transformation 
            let targetJson = {};
            let colorClassJson = [];
            message.data.searchResults.result.forEach(item => {
                console.log(item)

                // Construct the key for the target object by concatenating all values from item.payload
                const key = Object.values(item.payload).join('<br>');

                targetJson[key] = item.vector;
                colorClassJson.push(item.payload[message.data.colorBy]);

            });            

            const valuesFloat32Array = Array.from(Object.values(targetJson));
            let valuesArray = convertFloat32ArraysToArrays(valuesFloat32Array);
            const valuesArrayLength = valuesArray.length;

            // Check if the length is below 61
            // ugly workaround needed as the wasm module has no param for perplexity yet

            let compressed_vectors;
            if (valuesArrayLength < 61) {
                const vectorLength = valuesArray[0].length; // Assuming all vectors have the same length
                const vectorsToAdd = 61 - valuesArrayLength;

                console.log("added: ", vectorsToAdd)
                // Add random vectors to the array
                for (let i = 0; i < vectorsToAdd; i++) {
                    const randomVector = Array.from({ length: vectorLength }, () => Math.random());
                    valuesArray.push(randomVector);
                }

                const tsne_encoder = new tSNE(valuesArray);
                compressed_vectors = tsne_encoder.barnes_hut(message.data.iterations).slice(0, valuesArrayLength);//,theta=0.1);
            }
            else {
                const tsne_encoder = new tSNE(valuesArray);
                compressed_vectors = tsne_encoder.barnes_hut(message.data.iterations);
            }

            const end = performance.now();
            console.log('BHtSNE Execution time:', Math.round(end - start), 'ms');

            const originalKeys = Object.keys(targetJson);
            const originalEmbeddings = Object.values(targetJson)

            let plotDataArray = [];

            for (let i = 0; i < originalKeys.length; i++) {
                let thisVec = compressed_vectors[i];
                let similarity = calculateCosineSimilarity(originalEmbeddings[i]);

                console.log(originalKeys)
                if (similarity >= message.data.dimensionalityReductionSimilarityThreshold) {
                    plotDataArray.push({ 
                    "x": thisVec[0],
                    "y": thisVec[1],
                    "label": originalKeys[i],
                    "similarity": similarity,
                    "colorClass": colorClassJson[i]
                 });
                }
            }

            self.postMessage({
                type: 'tsne',
                plotDataArray
            });
            break

        default:
    }
};
