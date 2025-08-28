'use strict';

import * as path from 'path';
import * as vscode from 'vscode';
import * as JSON5 from 'json5';
//import { configurationSettings } from './globals/enums';

export class JsonEditorPanel {
    public static currentPanel: JsonEditorPanel | undefined;

    private static readonly viewType: string = 'jsonEditor';
    //private static readonly extensionPrefix: string = 'vscode-json-editor';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionPath: string;
    private _disposables: vscode.Disposable[] = [];
    private _currentEditor: vscode.TextEditor;

    private constructor(extensionPath: string, column: vscode.ViewColumn, theme: string) {
        this._extensionPath = extensionPath;
        this._currentEditor = vscode.window.activeTextEditor;
        this._panel = vscode.window.createWebviewPanel(JsonEditorPanel.viewType, "JSON Tree Editor", column, {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this._extensionPath, 'jsoneditor'))
            ]
        });

        this.updateWebviewContent(theme);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(message => {
            try {
                if (this._currentEditor && message && message.json !== undefined) {
                    this._currentEditor.edit(editBuilder => {
                        const range: vscode.Range = new vscode.Range(
                            this._currentEditor.document.positionAt(0),
                            this._currentEditor.document.positionAt(this._currentEditor.document.getText().length)
                        );

                        // Parse the JSON data and stringify it according to file type
                        try {
                            const parsedData = JSON.parse(message.json);
                            const formattedJson = this.stringifyJson(parsedData, this.isJson5File());
                            editBuilder.replace(range, formattedJson);
                        } catch (error) {
                            // Fallback to original message if parsing fails
                            editBuilder.replace(range, message.json || '');
                        }
                    }).then(undefined, error => {
                        console.error('Failed to edit document:', error);
                    });
                }
            } catch (error) {
                console.error('Error handling webview message:', error);
            }
        });

        vscode.window.onDidChangeActiveTextEditor(() => {
            try {
                this.onActiveEditorChanged();
            } catch (error) {
                console.error('Error handling active editor change:', error);
            }
        });
        vscode.workspace.onDidSaveTextDocument(() => {
            try {
                this.onDocumentChanged();
            } catch (error) {
                console.error('Error handling document change:', error);
            }
        });
        vscode.window.onDidChangeActiveColorTheme(() => {
            try {
                this.colorThemeKindChange(theme);
            } catch (error) {
                console.error('Error handling color theme change:', error);
            }
        });

        this.colorThemeKindChange(theme);
        this.onActiveEditorChanged();
    }

    // tslint:disable-next-line:function-name
    public static CreateOrShow(extensionPath: string): void {
        const column = vscode.ViewColumn.Beside;
        //const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(this.extensionPrefix);
        //const theme: string = config.get(configurationSettings.theme);

        const theme = {
            [vscode.ColorThemeKind.Light]: "light",
            [vscode.ColorThemeKind.Dark]: "dark",
            [vscode.ColorThemeKind.HighContrast]: "dark",
        }[vscode.window.activeColorTheme.kind];

        if (JsonEditorPanel.currentPanel) {
            JsonEditorPanel.currentPanel._panel.reveal(column);
        } else {
            JsonEditorPanel.currentPanel = new JsonEditorPanel(extensionPath, column, theme);
        }
    }

    public dispose(): void {
        JsonEditorPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private getJson(): string {
        let json: string = "";
        if (this._currentEditor && this._currentEditor.document) {
            json = this._currentEditor.document.getText() || "";
        }
        return json.trim();
    }

    private parseJson(jsonText: string): any {
        // Handle empty or whitespace-only content
        if (!jsonText || jsonText.trim() === '') {
            return {};
        }

        const trimmedText = jsonText.trim();

        try {
            // First try JSON5 parsing to support all JSON5 features
            return JSON5.parse(trimmedText);
        } catch (json5Error) {
            try {
                // Fallback to standard JSON parsing
                return JSON.parse(trimmedText);
            } catch (jsonError) {
                // If both fail, throw the JSON5 error as it's more permissive
                throw json5Error;
            }
        }
    }

    private stringifyJson(data: any, isJson5File: boolean = false): string {
        if (isJson5File) {
            // For JSON5 files, use JSON5.stringify to preserve JSON5 features where possible
            return JSON5.stringify(data, null, 2);
        } else {
            // For regular JSON files, use standard JSON.stringify
            return JSON.stringify(data, null, 2);
        }
    }

    private isJson5File(): boolean {
        if (this._currentEditor) {
            const fileName = this._currentEditor.document.fileName;
            return fileName.endsWith('.json5') || fileName.endsWith('.jsonc');
        }
        return false;
    }

    private colorThemeKindChange(currentTheme: string): void {
        const newTheme = {
            [vscode.ColorThemeKind.Light]: "light",
            [vscode.ColorThemeKind.Dark]: "dark",
            [vscode.ColorThemeKind.HighContrast]: "dark",
        }[vscode.window.activeColorTheme.kind];

        if (newTheme !== currentTheme) {
            // Update the webview content with the new theme
            this.updateWebviewContent(newTheme);
        }
    }

    private updateWebviewContent(theme: string): void {
        this._panel.webview.html = this.getHtmlForWebview(this._extensionPath, theme);
        // Re-send current JSON data to maintain state
        this.onActiveEditorChanged();
    }

    private onActiveEditorChanged(): void {
        try {
            // Check if webview panel is visible and focused to avoid unnecessary updates
            if (this._panel.visible && this._panel.active) {
                // If the panel is active, don't reload content unless the editor actually changed
                const currentEditor = vscode.window.activeTextEditor;
                if (currentEditor && currentEditor === this._currentEditor) {
                    // Same editor, no need to reload
                    return;
                }
            }

            if (vscode.window.activeTextEditor) {
                // Only update if this is a JSON file editor
                const activeEditor = vscode.window.activeTextEditor;
                const fileName = activeEditor.document.fileName;

                // Check if the active editor is a JSON file
                if (!fileName.endsWith('.json') && !fileName.endsWith('.json5') && !fileName.endsWith('.jsonc')) {
                    // Don't update for non-JSON files
                    return;
                }

                this._currentEditor = activeEditor;
                const jsonText: string = this.getJson();

                // Handle empty files gracefully
                if (!jsonText || jsonText.trim() === '') {
                    this._panel.webview.postMessage({ json: '{}' });
                    return;
                }

                try {
                    // Parse JSON5/JSON and send to webview
                    const parsedData = this.parseJson(jsonText);
                    const standardJson = JSON.stringify(parsedData, null, 2);
                    this._panel.webview.postMessage({ json: standardJson });
                } catch (error) {
                    console.error('JSON parsing error:', error);
                    // If parsing fails, send empty object to prevent webview errors
                    this._panel.webview.postMessage({ json: '{}', error: 'Invalid JSON content' });
                }
            }
            // Remove the fallback that sends empty object when no active editor
            // This prevents the editor from being cleared when focus changes
        } catch (error) {
            console.error('Error in onActiveEditorChanged:', error);
            // Only send fallback if we don't have a current editor at all
            if (!this._currentEditor) {
                this._panel.webview.postMessage({ json: '{}', error: 'Failed to load editor content' });
            }
        }
    }

    private onDocumentChanged(): void {
        try {
            // Only update if we have a current editor and it's a JSON file
            if (!this._currentEditor || !this._currentEditor.document) {
                return;
            }

            const fileName = this._currentEditor.document.fileName;
            if (!fileName.endsWith('.json') && !fileName.endsWith('.json5') && !fileName.endsWith('.jsonc')) {
                return;
            }

            const jsonText: string = this.getJson();

            // Handle empty files gracefully
            if (!jsonText || jsonText.trim() === '') {
                this._panel.webview.postMessage({ json: '{}' });
                return;
            }

            try {
                // Parse JSON5/JSON and send to webview
                const parsedData = this.parseJson(jsonText);
                const standardJson = JSON.stringify(parsedData, null, 2);
                this._panel.webview.postMessage({ json: standardJson });
            } catch (error) {
                console.error('JSON parsing error in document change:', error);
                // If parsing fails, don't send anything to preserve current content
                console.log('Preserving current webview content due to parsing error');
            }
        } catch (error) {
            console.error('Error in onDocumentChanged:', error);
            // Don't send fallback content to preserve current state
        }
    }

    private getHtmlForWebview(extensionPath: string, theme: string): string {
        const mainScriptPathOnDisk = vscode.Uri.file(path.join(extensionPath, 'jsoneditor', 'main.js'));
        const mainScriptUri = this._panel.webview.asWebviewUri(mainScriptPathOnDisk);
        const scriptPathOnDisk = vscode.Uri.file(path.join(extensionPath, 'jsoneditor', 'jsoneditor.min.js'));
        const scriptUri = this._panel.webview.asWebviewUri(scriptPathOnDisk);

        const cssPathOnDisk = vscode.Uri.file(path.join(extensionPath, 'jsoneditor', 'jsoneditor.min.css'));
        const cssUri = this._panel.webview.asWebviewUri(cssPathOnDisk);

        const cssDarkPathOnDisk = vscode.Uri.file(path.join(extensionPath, 'jsoneditor', 'jsoneditor.dark.min.css'));
        const cssDarkUri = this._panel.webview.asWebviewUri(cssDarkPathOnDisk);
        const darkTheme: string = theme === 'dark' ? `<link href="${cssDarkUri}" rel="stylesheet" type="text/css">` : '';

        const bodyStyle = theme === 'dark' ? 'background-color: #1e1e1e; color: #fff;' : 'background-color: #fff; color: #000;';

        return `
        <!DOCTYPE HTML>
        <html>
        <head>
            <!-- when using the mode "code", it's important to specify charset utf-8 -->
            <meta http-equiv="Content-Type" content="text/html;charset=utf-8">

            <link href="${cssUri}" rel="stylesheet" type="text/css">
            ${darkTheme}
            <script src="${scriptUri}"></script>
        </head>
        <body style="${bodyStyle}">
            <div id="jsoneditor"></div>

            <script src="${mainScriptUri}"></script>
        </body>
        </html>
        `;
    }
}
