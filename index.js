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

// Function to update URL with form parameters
function updateURL() {
    const qdrantURL = document.getElementById('QdrantURL').value;
    const inputText = document.getElementById('inputText').value;
    const qdrantLimit = document.getElementById('QdrantLimit').value;
    const hfModel = document.getElementById('HFModel').value;
    const quantizedToggle = document.getElementById('quantizedToggle').checked;

    const params = new URLSearchParams({
        qdrantURL,
        inputText,
        qdrantLimit,
        hfModel,
        quantizedToggle
    });

    window.history.replaceState({}, '', `?${params}`);
}

// Function to set form input fields based on URL parameters
function setFormInputsFromURL() {
    const urlParams = new URLSearchParams(window.location.search);

    // Check if there are any parameters in the URL
    if (urlParams.toString() === "") {
        return; // If no parameters, do nothing
    }

    // Update form inputs with URL parameters
    const qdrantURLParam = urlParams.get('qdrantURL');
    document.getElementById('QdrantURL').value = qdrantURLParam || '';

    const inputTextParam = urlParams.get('inputText');
    document.getElementById('inputText').value = inputTextParam || '';

    const qdrantLimitParam = urlParams.get('qdrantLimit');
    document.getElementById('QdrantLimit').value = qdrantLimitParam || '';

    const hfModelParam = urlParams.get('hfModel');
    document.getElementById('HFModel').value = hfModelParam || '';

    const quantizedToggleParam = urlParams.get('quantizedToggle');
    document.getElementById('quantizedToggle').checked = quantizedToggleParam === 'true';
}

// Call the function initially to set form inputs from URL parameters
setFormInputsFromURL();

// Add event listeners to form inputs to update URL
const formInputs = document.querySelectorAll('.form-control, .form-check-input');
formInputs.forEach(input => {
    input.addEventListener('input', updateURL);
});

async function loadModel(model, quantized = true) {
    if (model !== loadedModelName || quantized !== quantizedFlag) { // Check if model or quantized flag changed
        submitButton.setAttribute("disabled", "");
        loadingElement.style.display = "";
        submit_button_text.textContent = "Loading model...";

        embedder = await pipeline("feature-extraction", model, { quantized: quantized });
        loadedModelName = model;
        quantizedFlag = quantized; // Update quantized flag
        console.log("Model loaded:", loadedModelName, " quantized: ", quantized );
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

    const response = await fetch(`${document.getElementById("QdrantURL").value}/points/search`, requestOptions);
    const data = await response.json();

    return data;
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
    submitButton.setAttribute("disabled","");

    let inputText = document.getElementById("inputText").value.trim();
    if (inputText !== "") {
        let output = await embedder(inputText, { pooling: 'mean', normalize: true });
        const collectionName = "test_collection";
        var vectorData = Array.from(output["data"]);
        const filter = {};
        const limit =  parseInt(document.getElementById("QdrantLimit").value);
        const offset =  0;
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
            function hyperlinkRenderer(params) {
                if (isHyperlink(params.value)) {
                    return `<a href="${params.value}" target="_blank">${params.value}</a>`;
                } else {
                    return params.value;
                }
            }

            // Update your column definition
            const columnDefs = [
                { headerName: 'id', field: 'id' },
                { headerName: 'score', field: 'score' },
                ...payloadKeys.map(key => ({
                    headerName: key,
                    field: `payload.${key}`,
                    maxWidth:   300,
                    editable: true,
                    valueGetter: params => params.data.payload[key],
                    tooltipValueGetter: (params) => params.value,
                    filter: true,
                    autoHeight: true,
                    cellRenderer: hyperlinkRenderer // Use the custom cell renderer
                })),
            ];

            // Check if the grid has already been initialized
            if (gridApi) {
                // If the grid is already initialized, update the row data
                gridApi.setRowData(searchResults.result);
            } else {
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

function onFilterTextBoxChanged () {
    gridApi.setGridOption(
      'quickFilterText',
      document.getElementById('filter-text-box').value
    );
  }

filterTextBox.addEventListener('input', () => {
    onFilterTextBoxChanged();
});

document.getElementById('copyURLButton').addEventListener('click', function() {
    var urlToCopy = window.location.href;
    
    navigator.clipboard.writeText(urlToCopy)
        .then(function() {
            console.log('URL copied to clipboard successfully: ' + urlToCopy);
            // You can also show a success message here if needed
        })
        .catch(function(err) {
            console.error('Failed to copy URL to clipboard: ', err);
            // You can also show an error message here if needed
        });
});
