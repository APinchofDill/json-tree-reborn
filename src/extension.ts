'use strict';
import * as vscode from 'vscode';
import { JsonEditorPanel } from './JsonEditorPanel';

// Global variable to track the last opened JSON file
let lastOpenedJsonFile: vscode.Uri | undefined;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
// tslint:disable-next-line:export-name
export function activate(context: vscode.ExtensionContext): void {

    // Track when text editors change to remember the last JSON file
    const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && isJsonFile(editor.document.fileName)) {
            lastOpenedJsonFile = editor.document.uri;
        }
    });

    // Track when documents are opened to remember JSON files
    const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument((document) => {
        if (isJsonFile(document.fileName)) {
            lastOpenedJsonFile = document.uri;
        }
    });

    const startCommand = vscode.commands.registerCommand('vscode-json-editor.start', resource => {
        try {
            if (resource) {
                // Remember this resource as the last opened JSON file
                if (isJsonFile(resource.fsPath)) {
                    lastOpenedJsonFile = resource;
                }
                
                if (isOpened(resource)) {
                    // case when there's a resource and it's already opened
                    JsonEditorPanel.CreateOrShow(context.extensionPath);
                } else {
                    // case when there's a resource but not already opened
                    vscode.window.showTextDocument(resource)
                        .then(() => {
                            try {
                                JsonEditorPanel.CreateOrShow(context.extensionPath);
                            } catch (error) {
                                console.error('Error creating JsonEditorPanel after opening document:', error);
                                vscode.window.showErrorMessage('Failed to open JSON Tree Editor: ' + (error as Error).message);
                            }
                        }, error => {
                            console.error('Error opening text document:', error);
                            vscode.window.showErrorMessage('Failed to open document: ' + (error as Error).message);
                        });
                }
            } else {
                // case when there is no resource passed down (toolbar button clicked)
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor && isJsonFile(activeEditor.document.fileName)) {
                    // If current editor is a JSON file, use it and remember it
                    lastOpenedJsonFile = activeEditor.document.uri;
                    JsonEditorPanel.CreateOrShow(context.extensionPath);
                } else if (lastOpenedJsonFile) {
                    // If no active JSON file but we have a last opened JSON file, use that
                    vscode.workspace.openTextDocument(lastOpenedJsonFile).then(document => {
                        vscode.window.showTextDocument(document, vscode.ViewColumn.One).then(() => {
                            JsonEditorPanel.CreateOrShow(context.extensionPath);
                        }, error => {
                            console.error('Error showing text document:', error);
                            vscode.window.showErrorMessage('Failed to show the JSON file.');
                        });
                    }, error => {
                        // If the file no longer exists or can't be opened, clear it from memory
                        console.error('Error opening last JSON file:', error);
                        lastOpenedJsonFile = undefined;
                        vscode.window.showErrorMessage('The previously opened JSON file is no longer available.');
                    });
                } else {
                    // No JSON file available
                    vscode.window.showErrorMessage('No JSON file is currently open or has been previously opened.');
                }
            }
        } catch (error) {
            console.error('Error in vscode-json-editor.start command:', error);
            vscode.window.showErrorMessage('Failed to start JSON Tree Editor: ' + error.message);
        }
    });

    context.subscriptions.push(startCommand, onDidChangeActiveTextEditor, onDidOpenTextDocument);
}

// Returns true if an editor is already opened for the given resource
function isOpened(resource) {
    try {
        if (!resource || !resource.path) {
            return false;
        }
        
        const openedPaths = vscode.window.visibleTextEditors
            .filter(editor => editor && editor.document && editor.document.uri)
            .map(editor => editor.document.uri.path);
        
        return openedPaths.includes(resource.path);
    } catch (error) {
        console.error('Error checking if resource is opened:', error);
        return false;
    }
}

// Returns true if the file is a JSON file (json, json5, or jsonc)
function isJsonFile(fileName: string): boolean {
    return fileName.endsWith('.json') || fileName.endsWith('.json5') || fileName.endsWith('.jsonc');
}
