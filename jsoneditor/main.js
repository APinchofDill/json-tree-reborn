const vscode = acquireVsCodeApi();

// Store the current JSON content to prevent unnecessary updates
let currentJsonContent = null;
let isUpdatingFromVSCode = false;

// Safely create the editor with error handling
function initializeEditor() {
    try {
        const container = document.getElementById("jsoneditor");
        if (!container) {
            console.error('JSONEditor container not found');
            return null;
        }
        
        container.style.height = window.innerHeight + "px";

        const options = {
            mode: 'tree',
            onError: function (err) {
                console.error('JSONEditor error:', err);
                // Show error in a less intrusive way than alert
                try {
                    vscode.postMessage({
                        error: err ? err.toString() : 'Unknown JSONEditor error'
                    });
                } catch (postError) {
                    console.error('Failed to post error message:', postError);
                }
            },
            onChangeJSON: function (json) {
                try {
                    // Skip processing if we're currently updating from VS Code
                    if (isUpdatingFromVSCode) {
                        return;
                    }
                    
                    // If json is null/undefined and we have existing content, don't clear it
                    if ((json === null || json === undefined) && currentJsonContent !== null) {
                        console.log('Ignoring null/undefined change - preserving existing content');
                        return;
                    }
                    
                    // Convert null/undefined to empty object only if we don't have existing content
                    if (json === null || json === undefined) {
                        json = {};
                    }
                    
                    const jsonString = JSON.stringify(json, null, 2);
                    
                    // Only send update if content actually changed
                    if (jsonString !== currentJsonContent) {
                        currentJsonContent = jsonString;
                        vscode.postMessage({
                            json: jsonString
                        });
                    }
                } catch (error) {
                    console.error('Error in onChangeJSON:', error);
                    // Only send fallback if we don't have existing content
                    if (currentJsonContent === null) {
                        try {
                            currentJsonContent = '{}';
                            vscode.postMessage({
                                json: '{}'
                            });
                        } catch (postError) {
                            console.error('Failed to post fallback message:', postError);
                        }
                    }
                }
            },
            // Enhanced options for better JSON5 support
            sortObjectKeys: false, // Preserve key order
            search: true, // Enable search functionality
            modes: ['tree', 'view', 'form'], // Allow switching modes
            mode: 'tree' // Default to tree mode
        };

        return new JSONEditor(container, options);
    } catch (error) {
        console.error('Failed to initialize JSONEditor:', error);
        return null;
    }
}

const editor = initializeEditor();

window.addEventListener('message', event => {
    try {
        // Validate event and message structure
        if (!event || !event.data) {
            console.warn('Received invalid message event');
            return;
        }
        
        const message = event.data;
        
        // Validate message has json property
        if (!message || message.json === undefined) {
            console.warn('Received message without json property');
            return;
        }
        
        // Check if editor is available
        if (!editor) {
            console.error('JSONEditor not initialized');
            return;
        }

        try {
            let json;
            
            // Handle empty or null JSON
            if (message.json === '' || message.json === null || message.json === undefined) {
                json = {};
            } else if (typeof message.json === 'string') {
                // Try to parse string JSON
                const trimmedJson = message.json.trim();
                if (trimmedJson === '') {
                    json = {};
                } else {
                    try {
                        json = JSON.parse(trimmedJson);
                    } catch (parseError) {
                        console.error('Failed to parse JSON string:', parseError);
                        // Fallback to empty object for invalid JSON
                        json = {};
                    }
                }
            } else {
                // Use the JSON object directly
                json = message.json;
            }
            
            // Ensure json is not null/undefined before updating editor
            if (json === null || json === undefined) {
                json = {};
            }
            
            // Update the editor with protection flag
            isUpdatingFromVSCode = true;
            editor.update(json);
            
            // Store the current content and clear the update flag
            currentJsonContent = JSON.stringify(json, null, 2);
            
            // Use setTimeout to ensure the update is complete before clearing the flag
            setTimeout(() => {
                isUpdatingFromVSCode = false;
            }, 100);
            
        } catch (updateError) {
            console.error('Failed to update JSONEditor:', updateError);
            
            // Try fallback methods
            try {
                if (message.json && typeof message.json === 'string') {
                    // Try to show raw text if available
                    if (editor.updateText) {
                        editor.updateText(message.json);
                    } else {
                        // Only fallback to empty object if we don't have existing content
                        if (currentJsonContent === null) {
                            isUpdatingFromVSCode = true;
                            editor.update({});
                            currentJsonContent = '{}';
                            setTimeout(() => {
                                isUpdatingFromVSCode = false;
                            }, 100);
                        }
                    }
                } else {
                    // Only set to empty object if we don't have existing content
                    if (currentJsonContent === null) {
                        isUpdatingFromVSCode = true;
                        editor.update({});
                        currentJsonContent = '{}';
                        setTimeout(() => {
                            isUpdatingFromVSCode = false;
                        }, 100);
                    }
                }
            } catch (fallbackError) {
                console.error('All editor update methods failed:', fallbackError);
            }
        }
    } catch (error) {
        console.error('Error in message event handler:', error);
    }
});

// Handle window resize for better responsiveness
window.addEventListener('resize', function() {
    try {
        const container = document.getElementById("jsoneditor");
        if (container) {
            container.style.height = window.innerHeight + "px";
        }
        
        if (editor && typeof editor.resize === 'function') {
            editor.resize();
        }
    } catch (error) {
        console.error('Error handling window resize:', error);
    }
});

// Handle any uncaught errors in the webview
window.addEventListener('error', function(error) {
    console.error('Uncaught error in webview:', error);
    try {
        vscode.postMessage({
            error: 'Uncaught error: ' + (error.message || error.toString())
        });
    } catch (postError) {
        console.error('Failed to post uncaught error message:', postError);
    }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection in webview:', event.reason);
    try {
        vscode.postMessage({
            error: 'Unhandled promise rejection: ' + (event.reason ? event.reason.toString() : 'Unknown')
        });
    } catch (postError) {
        console.error('Failed to post promise rejection message:', postError);
    }
});
