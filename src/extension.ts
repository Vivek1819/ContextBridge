import * as vscode from 'vscode';
import { ContextBridge } from './contextBridge';

export function activate(context: vscode.ExtensionContext) {
    const contextBridge = new ContextBridge(context.workspaceState);

    // Register "Sync Repo → Chat" command
    const syncRepoCommand = vscode.commands.registerCommand(
        'contextbridge.syncRepo',
        async () => {
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    vscode.window.showErrorMessage('No workspace folder open');
                    return;
                }

                const contextText = await contextBridge.syncRepo(workspaceFolder);
                await vscode.env.clipboard.writeText(contextText);
                vscode.window.showInformationMessage('ContextBridge: Repo context copied to clipboard');
            } catch (error) {
                vscode.window.showErrorMessage(`ContextBridge error: ${error}`);
            }
        }
    );

    // Register "Deep Sync Current File → Chat" command
    const deepSyncFileCommand = vscode.commands.registerCommand(
        'contextbridge.deepSyncFile',
        async () => {
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage('No active editor');
                    return;
                }

                const contextText = await contextBridge.deepSyncFile(editor.document);
                await vscode.env.clipboard.writeText(contextText);
                vscode.window.showInformationMessage('ContextBridge: File content copied to clipboard');
            } catch (error) {
                vscode.window.showErrorMessage(`ContextBridge error: ${error}`);
            }
        }
    );

    // 🔹 Status Bar button for "Sync Repo"
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = '$(repo) Context';
    statusBarItem.tooltip = 'ContextBridge: Sync Repo Context';
    statusBarItem.command = 'contextbridge.syncRepo';
    statusBarItem.show();

    context.subscriptions.push(
        syncRepoCommand,
        deepSyncFileCommand,
        statusBarItem
    );
}

export function deactivate() {}
