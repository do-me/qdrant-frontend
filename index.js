import { pipeline } from '@xenova/transformers';
import { createGrid } from 'ag-grid-community';
import * as XLSX from 'xlsx';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

const loadingElement = document.getElementById("loading");
const submitButton = document.getElementById("submit_button");
const submit_button_text = document.getElementById("submit_button_text")
const filterTextBox = document.getElementById('filter-text-box');
const eGridDiv = document.querySelector('#myGrid');

let searchResults;
let embedder;
let loadedModelName = null;
let quantizedFlag = true;
let thisCollection;
let lastCollection = "";

const special_vector = [] // A special vector can be hardcoded here, so that instead of calculating it with the model, this vector is used. Will be displayed bold. 

// Function to update URL with form parameters
function updateURL() {
    const qdrantURL = document.getElementById('QdrantURL').value;
    const qdrantLimit = document.getElementById('QdrantLimit').value;
    const hfModel = document.getElementById('HFModel').value;
    const quantizedToggle = document.getElementById('quantizedToggle').checked;

    // Select all query containers
    const queryContainers = document.querySelectorAll('.queryContainer');
    let queries = [];

    queryContainers.forEach((container, index) => {
        // Adjusted selectors to match the updated HTML
        const inputText = container.querySelector('.inputText').value;
        const queryWeight = container.querySelector('.queryWeight').value;
        const activeState = container.querySelector(`.activeToggle`).checked;

        // Create an object for each query with its parameters and index
        const query = {
            index, // Add the index of the query row
            inputText,
            queryWeight,
            activeState
        };

        // Add the query object to the queries array
        queries.push(query);
    });

    // Convert the queries array to a string for the URL parameters
    const queriesString = JSON.stringify(queries);

    const params = new URLSearchParams({
        qdrantURL,
        queries: queriesString, // This now includes the index of each query row
        qdrantLimit,
        hfModel,
        quantizedToggle
    });

    window.history.replaceState({}, '', `?${params}`);
}

function setFormInputsFromURL() {
    // Parse the current URL
    const url = new URL(window.location.href);
    const urlParams = url.searchParams;

    // Check if there are any parameters in the URL
    if (urlParams.toString() === "") {
        return; // If no parameters, do nothing
    }

    // Update form inputs with URL parameters
    const qdrantURLParam = urlParams.get('qdrantURL');
    document.getElementById('QdrantURL').value = qdrantURLParam || '';

    const qdrantLimitParam = urlParams.get('qdrantLimit');
    document.getElementById('QdrantLimit').value = qdrantLimitParam || '';

    const hfModelParam = urlParams.get('hfModel');
    document.getElementById('HFModel').value = hfModelParam || '';

    const quantizedToggleParam = urlParams.get('quantizedToggle');
    document.getElementById('quantizedToggle').checked = quantizedToggleParam === 'true';

    // Handle query parameters
    const queriesParam = urlParams.get('queries');
    if (queriesParam) {
        const queries = JSON.parse(queriesParam);
        let rowCount = 1; // Reset row count for dynamic rows

        // Directly update the first row if it's part of the queries
        if (queries.length > 0 && queries[0].hasOwnProperty('inputText')) {
            const firstQuery = queries.shift(); // Remove the first query from the array

            const inputText0 = document.getElementById('inputText0')
            inputText0.value = firstQuery.inputText || '';

            if (inputText0.value === "special_vector") {
                // If the condition is met, apply italic text and grey background
                inputText0.style.fontStyle = 'italic';
                //event.target.style.backgroundColor = 'grey';
            } else {
                // If the condition is not met, remove italic text and grey background
                inputText0.style.fontStyle = 'normal';
                //event.target.style.backgroundColor = '';
            }

            document.getElementById('weight0').value = firstQuery.queryWeight || '';
            document.getElementById('activeToggle0').checked = firstQuery.activeState;
        }

        // Remove existing query rows
        //const queryRowsContainer = document.getElementById('queryRowsContainer');
        // Assuming you want to clear all existing dynamic rows before adding new ones
        //queryRowsContainer.innerHTML = '';

        // Dynamically create query rows based on URL parameters
        queries.forEach((query, index) => {
            addRow(query, index + 1); // Pass query data and the new row number
        });
    }
}

// Function to remove a row
function removeRow(rowToRemove) {
    rowToRemove.remove();
    // Adjust IDs of all remaining rows
    let remainingRows = document.querySelectorAll('.queryContainer');
    for (let i = 0; i < remainingRows.length; i++) {
        remainingRows[i].querySelectorAll('input, button').forEach(function (element) {
            const currentId = element.id;
            const newId = currentId.replace(/\d+$/, i + 1); // Adjust the ID to reflect the new row count
            element.id = newId;
        });
    }
}

function addRow(queryData, rowNumber) {
    const originalRow = document.getElementById('initialQueryContainer');
    const clone = originalRow.cloneNode(true);
    clone.id = 'queryContainer' + rowNumber; // Adjust the ID of the cloned row

    // Adjust IDs of all elements within the cloned row
    clone.querySelectorAll('input, button').forEach(function (element) {
        const currentId = element.id;
        const newId = currentId.replace(/\d+$/, rowNumber); // Replace the last digit(s) with the current rowNumber
        element.id = newId;
    });

    // Set values from queryData
    clone.querySelector('.inputText').value = queryData.inputText || '';

    // Set values from queryData
    const inputTextX = clone.querySelector('.inputText')
    inputTextX.value = queryData.inputText || '';

    if (inputTextX.value === "special_vector") {
        // If the condition is met, apply italic text and grey background
        inputTextX.style.fontStyle = 'italic';
        //event.target.style.backgroundColor = 'grey';
    } else {
        // If the condition is not met, remove italic text and grey background
        inputTextX.style.fontStyle = 'normal';
        //event.target.style.backgroundColor = '';
    }


    clone.querySelector('.queryWeight').value = queryData.queryWeight || '';
    clone.querySelector('.activeToggle').checked = queryData.activeState;

    const minusButton = clone.querySelector('.queryButton');
    // must use SVG here as emoji create problems with npm
    minusButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0  0  24  24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-plus">
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>`
    minusButton.title = 'Remove query';
    minusButton.addEventListener('click', function () { removeRow(clone); }); // Attach event listener to the minus button

    document.getElementById('queryRowsContainer').appendChild(clone);
}

async function loadModel(model, quantized = true) {
    if (model !== loadedModelName || quantized !== quantizedFlag) { // Check if model or quantized flag changed
        submitButton.setAttribute("disabled", "");
        loadingElement.style.display = "";
        submit_button_text.textContent = "Loading model...";

        embedder = await pipeline("feature-extraction", model, { quantized: quantized });
        loadedModelName = model;
        quantizedFlag = quantized; // Update quantized flag
        console.log("Model loaded:", loadedModelName, " quantized: ", quantized);
    } else {
        console.log("Model already loaded:", loadedModelName, " quantized: ", quantized);
    }
}

submitButton.onclick = () => {
    const modelName = document.getElementById("HFModel").value;
    const quantized = document.getElementById("quantizedToggle").checked;
    loadModel(modelName, quantized).then(() => {
        sendRequest();
    });
};

download_csv.onclick = () => {
    exportData(searchResults, "csv");
};

download_xlsx.onclick = () => {
    exportData(searchResults, "excel");
};

download_json.onclick = () => {
    exportData(searchResults, "json");
};

////////////////////////////////////////////////////////////////////

async function searchPoints(collectionName, vectorData, filter, limit, offset, withPayload, withVector, scoreThreshold) {
    var reqBody = JSON.stringify({
        vector: vectorData,
        filter: filter,
        limit: limit,
        offset: offset,
        with_payload: withPayload,
        with_vector: withVector,
        score_threshold: scoreThreshold,
    });

    const requestOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: reqBody,
    };

    thisCollection = document.getElementById("QdrantURL").value
    const response = await fetch(`${thisCollection}/points/search`, requestOptions);
    const data = await response.json();

    return data;
}


function getQueryTextsAndWeigths() {
    const queryContainers = document.querySelectorAll('.queryContainer');

    const activeQueries = Array.from(queryContainers).filter(container => {
        const activeToggle = container.querySelector('.activeToggle');
        return activeToggle.checked;
    }).map(container => {
        const inputText = container.querySelector('.inputText').value.trim();
        const weight = container.querySelector('.queryWeight').value;
        return { inputText, weight };
    });

    const jsonObject = JSON.stringify(activeQueries);

    console.log(jsonObject); // Logs the JSON string of active queries

    return jsonObject
}

async function processInputText(inputText) {

    if (inputText == "special_vector") {
        return special_vector
    }
    else {
        const output = await embedder(inputText, { pooling: 'mean', normalize: true });
        const vectorArray = Array.from(output["data"]);
        return vectorArray;
    }
}

async function processQueries() {
    const jsonObject = getQueryTextsAndWeigths();
    const queries = JSON.parse(jsonObject);

    // Step  1: Calculate the vector for each text
    const vectors = await Promise.all(queries.map(async query => {
        const { inputText } = query
        return await processInputText(inputText)
    }));

    // Step  2: Calculate the weighted average vector
    const weightedAverageVector = vectors.reduce((acc, vector, index) => {
        const weight = queries[index].weight;
        return acc.map((val, i) => val + vector[i] * weight);
    }, new Array(vectors[0].length).fill(0));

    // Normalize the weighted average vector
    const magnitude = Math.sqrt(weightedAverageVector.reduce((sum, val) => sum + val * val, 0));
    const normalizedWeightedAverageVector = weightedAverageVector.map(val => val / magnitude);

    console.log(normalizedWeightedAverageVector); // Logs the normalized weighted average vector
    return normalizedWeightedAverageVector
}

// Define global variables for the grid API and options
let gridApi;
let gridOptions;


async function sendRequest() {
    try {
        gridApi.showLoadingOverlay();
    }
    catch (error) {
    }
    loadingElement.style.display = "";
    submit_button_text.textContent = "Loading results...";
    submitButton.setAttribute("disabled", "");

    let inputText = document.getElementsByClassName("inputText")[0].value.trim();
    //const trimmedInputTexts = Array.from(document.getElementsByClassName("inputText")).map(input => input.value.trim());

    if (inputText !== "") {
        //let output = await embedder(inputText, { pooling: 'mean', normalize: true });
        const collectionName = "test_collection";
        const vectorData = await processQueries();//Array.from(output["data"]);
        const filter = {};
        const limit = parseInt(document.getElementById("QdrantLimit").value);
        const offset = 0;
        const withPayload = true;
        const withVector = false;
        const scoreThreshold = null;

        try {

            searchResults = await searchPoints(collectionName, vectorData, filter, limit, offset, withPayload, withVector, scoreThreshold);
            //console.log(searchResults);

            // Extract payload keys
            const payloadKeys = Object.keys(searchResults.result[0].payload);

            function isHyperlink(value) {
                return /^https?:\/\//.test(value);
            }

            // Custom cell renderer
            function customRenderer(params) {
                const nestedKey = Object.keys(params.data.payload).find(key => typeof params.data.payload[key] === 'object');
                const value = params.data.payload[params.colDef.field.split('.')[1]];

                if (params.colDef.field.endsWith(`.${nestedKey}`)) {
                    return typeof value === 'object' ? JSON.stringify(value) : value; // Render nested element as string
                } else if (isHyperlink(value)) {
                    return `<a href="${value}" target="_blank">${value}</a>`;
                } else {
                    return value;
                }
            }

            // Update your column definition
            const columnDefs = [
                { headerName: 'id', field: 'id' },
                { headerName: 'score', field: 'score' },
                ...payloadKeys.map(key => ({
                    headerName: key,
                    field: `payload.${key}`,
                    maxWidth: 300,
                    editable: true,
                    valueGetter: params => params.data.payload[key],
                    tooltipValueGetter: (params) => params.value,
                    filter: true,
                    autoHeight: true,
                    cellRenderer: customRenderer // Use the custom cell renderer
                })),
            ];


            // Check if the grid has already been initialized
            if (gridApi && thisCollection === lastCollection) {
                // If the grid is already initialized, update the row data
                gridApi.setRowData(searchResults.result);
            } else {

                try {
                    //gridOptions.api.destroy()
                    //document.getElementById("myGrid").innerHTML = "";
                    if (thisCollection !== lastCollection) {
                        // update column headers if needed
                        gridApi.updateGridOptions({ columnDefs: columnDefs })
                    }
                    gridApi.setRowData(searchResults.result);
                    loadingElement.style.display = "none";
                    submit_button_text.textContent = "Submit";
                    submitButton.removeAttribute("disabled");

                    lastCollection = thisCollection
                    return
                }
                catch { }

                // If the grid is not initialized, create the grid
                gridOptions = {
                    autoSizeStrategy: {
                        type: 'fitCellContents'
                    },
                    domLayout: 'autoHeight', // Add this line to enable auto height
                    columnDefs: columnDefs,
                    rowData: searchResults.result,
                    tooltipShowDelay: 0,
                    overlayLoadingTemplate:
                        '<div aria-live="polite" aria-atomic="true" style="position:absolute;top:0;left:0;right:0; bottom:0; background: url(https://ag-grid.com/images/ag-grid-loading-spinner.svg) center no-repeat" aria-label="loading"></div>',
                    overlayNoRowsTemplate:
                        '<span aria-live="polite" aria-atomic="true" style="padding: 10px; border: 2px solid #666; background: #55AA77;">This is a custom \'no rows\' overlay</span>',

                };

                gridApi = createGrid(eGridDiv, gridOptions);
                document.getElementById("exportDropdown").removeAttribute("disabled")
                document.getElementById("quickFilter").style.display = "";

            }

            loadingElement.style.display = "none";
            submit_button_text.textContent = "Submit";
            submitButton.removeAttribute("disabled");

            // on first click add the quick filter listener
            if (lastCollection == "" && !filterTextBox._listenerInitialized) {
                function onFilterTextBoxChanged() {
                    gridApi.setGridOption(
                        'quickFilterText',
                        document.getElementById('filter-text-box').value
                    );
                }

                filterTextBox.addEventListener('input', () => {
                    onFilterTextBoxChanged();
                });

                // Mark listener as initialized
                filterTextBox._listenerInitialized = true;

            }


            lastCollection = thisCollection


        } catch (error) {
            console.error(error);
        }
    }
}

async function exportData(data, format) {
    // Function to flatten the payload object within each object
    function flattenPayload(jsonData) {
        // Check if jsonData is an array
        if (!Array.isArray(jsonData)) {
            console.error('jsonData is not an array');
            return jsonData;
        }

        // Check if every element in the array is an object
        if (!jsonData.every(item => typeof item === 'object')) {
            console.error('One or more elements in jsonData are not objects');
            return jsonData;
        }

        // Map over the array and flatten the payload object
        return jsonData.map(item => {
            const { payload, ...rest } = item;
            return { ...rest, ...payload };
        });
    }

    // Flatten the payload object within each object
    let jsonData = flattenPayload(data.result);

    // Based on the format parameter, generate the output accordingly
    if (format === 'excel') {
        // Create a new workbook
        const workbook = XLSX.utils.book_new();

        // Convert JSON to worksheet
        const worksheet = XLSX.utils.json_to_sheet(jsonData);

        // Add the worksheet to the workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

        // Generate a blob from the workbook
        const excelBlob = new Blob([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });

        // Create a temporary URL for the blob
        const excelUrl = URL.createObjectURL(excelBlob);

        // Create a link element
        const link = document.createElement('a');
        link.href = excelUrl;
        link.download = `${document.getElementById("inputText").value.trim()}.xlsx`;

        // Append the link to the document body and trigger the download
        document.body.appendChild(link);
        link.click();

        // Clean up
        URL.revokeObjectURL(excelUrl);
        document.body.removeChild(link);
    } else if (format === 'csv') {
        // Convert JSON to CSV
        const csvContent = jsonData.map(row => {
            return Object.values(row).map(value => {
                if (typeof value === 'string') {
                    // Escape double quotes within the value and enclose it in double quotes
                    return '"' + value.replace(/"/g, '""') + '"';
                }
                return value;
            }).join(',');
        }).join('\n');

        // Create a blob from the CSV content
        const csvBlob = new Blob([csvContent], { type: 'text/csv' });
        const csvUrl = URL.createObjectURL(csvBlob);

        // Create a link element
        const link = document.createElement('a');
        link.href = csvUrl;
        link.download = `${document.getElementById("inputText").value.trim()}.csv`;

        // Append the link to the document body and trigger the download
        document.body.appendChild(link);
        link.click();

        // Clean up
        URL.revokeObjectURL(csvUrl);
        document.body.removeChild(link);


    } else if (format === 'json') {
        // Convert JSON to string
        const jsonString = JSON.stringify(jsonData, null, 2);

        // Create a blob from the JSON string
        const jsonBlob = new Blob([jsonString], { type: 'application/json' });

        // Create a temporary URL for the blob
        const jsonUrl = URL.createObjectURL(jsonBlob);

        // Create a link element
        const link = document.createElement('a');
        link.href = jsonUrl;
        link.download = `${document.getElementById("inputText").value.trim()}.json`;

        // Append the link to the document body and trigger the download
        document.body.appendChild(link);
        link.click();

        // Clean up
        URL.revokeObjectURL(jsonUrl);
        document.body.removeChild(link);
    } else {
        console.error('Unsupported format');
    }
}

document.getElementById('copyURLButton').addEventListener('click', function () {
    var urlToCopy = window.location.href;

    navigator.clipboard.writeText(urlToCopy)
        .then(function () {
            console.log('URL copied to clipboard successfully: ' + urlToCopy);
            // You can also show a success message here if needed
        })
        .catch(function (err) {
            console.error('Failed to copy URL to clipboard: ', err);
            // You can also show an error message here if needed
        });
});

document.addEventListener('DOMContentLoaded', function () {
    // Initialize a counter for the current row count
    let rowCount = 1; // Assuming the initial row is already present

    // Function to clone the row and replace the plus button with a minus button
    function TaddRow() {
        const originalRow = document.getElementById('initialQueryContainer');
        const clone = originalRow.cloneNode(true);
        clone.id = 'queryContainer' + rowCount; // Adjust the ID of the cloned row

        // Adjust IDs of all elements within the cloned row
        clone.querySelectorAll('input, button').forEach(function (element) {
            const currentId = element.id;
            const newId = currentId.replace(/\d+$/, rowCount); // Replace the last digit(s) with the current rowCount
            element.id = newId;
        });

        const minusButton = clone.querySelector('.queryButton');
        minusButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0  0  24  24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-plus">
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>`
        minusButton.title = 'Remove query';
        minusButton.addEventListener('click', function () { removeRow(clone); }); // Attach event listener to the minus button

        document.getElementById('queryRowsContainer').appendChild(clone);
        rowCount++; // Increment the row count
    }

    // Add event listener to the plus button
    const plusButton = document.querySelector('.btn-light');
    plusButton.addEventListener('click', TaddRow);
});

var URLModeHidden = document.getElementById("copyURLButton").hidden;

if (URLModeHidden) {

} else {
    // Call the function initially to set form inputs from URL parameters
    document.addEventListener('DOMContentLoaded', function () {
        // Your code here
        setFormInputsFromURL();

        // Use event delegation to handle inputs dynamically added
        document.body.addEventListener('input', function (event) {
            if (event.target.matches('.form-control, .form-check-input')) {
                updateURL(event);
            }

            if (event.target.matches('.inputText')) {
                // Check if the trimmed value of the input is "special_vector"
                if (event.target.value.trim() === "special_vector") {
                    // If the condition is met, apply italic text and grey background
                    event.target.style.fontStyle = 'italic';
                    //event.target.style.backgroundColor = 'grey';
                } else {
                    // If the condition is not met, remove italic text and grey background
                    event.target.style.fontStyle = 'normal';
                    //event.target.style.backgroundColor = '';
                }
            }
        });

        document.body.addEventListener('click', function (event) {
            if (event.target.matches('.queryButton')) {
                updateURL(event);
            }
        });

    });
}
