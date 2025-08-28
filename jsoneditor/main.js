const vscode = acquireVsCodeApi();

// create the editor
const container = document.getElementById("jsoneditor");
container.style.height = window.innerHeight + "px";

const options = {
    mode: 'tree',
    onError: function (err) {
        console.error('JSONEditor error:', err);
        // Show error in a less intrusive way than alert
        vscode.postMessage({
            error: err.toString()
        });
    },
    onChangeJSON: function (json) {
        const jsonString = JSON.stringify(json, null, 2);
        vscode.postMessage({
            json: jsonString
        });
    },
    // Enhanced options for better JSON5 support
    sortObjectKeys: false, // Preserve key order
    search: true, // Enable search functionality
    modes: ['tree', 'view', 'form'], // Allow switching modes
    mode: 'tree' // Default to tree mode
};

const editor = new JSONEditor(container, options);

window.addEventListener('message', event => {
    const message = event.data; // The JSON data our extension sent

    try {
        let json;
        if (typeof message.json === 'string') {
            json = JSON.parse(message.json);
        } else {
            json = message.json;
        }
        editor.update(json);
    } catch (error) {
        console.error('Failed to parse JSON in webview:', error);
        // Try to show the raw text if parsing fails
        try {
            editor.updateText(message.json);
        } catch (textError) {
            console.error('Failed to update editor with raw text:', textError);
        }
    }
});

// Handle window resize for better responsiveness
window.addEventListener('resize', function() {
    container.style.height = window.innerHeight + "px";
    if (editor && editor.resize) {
        editor.resize();
    }
});
