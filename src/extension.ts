import * as vscode from 'vscode';
import { ContextBridge } from './contextBridge';

type ContextComposition = {
    intent: string | null;
    include: {
      repoStructure: boolean;
      contextDelta: boolean;
      activeFile: boolean;
      diagnostics: boolean;
      terminal: boolean;
      keyFiles: boolean;
      git: boolean;
    };
  };
  

export function activate(context: vscode.ExtensionContext) {
    const contextBridge = new ContextBridge(context.workspaceState);

    // Register "Sync Repo → Chat" command
    const syncRepoCommand = vscode.commands.registerCommand(
        'contextbridge.syncRepo',
        async () => {
            const intent = await vscode.window.showInputBox({
                title: 'ContextBridge — Intent',
                prompt: 'What are you trying to do? (optional)',
                placeHolder: 'e.g. Debug a type error in Navbar.tsx',
                ignoreFocusOut: true
            });
    
            if (intent === undefined) {
                return;
            }
    
            const picks = await vscode.window.showQuickPick(
                [
                    { label: 'Repo structure', picked: true },
                    { label: 'Context delta (changes since last sync)', picked: true },
                    { label: 'Active file', picked: true },
                    { label: 'Diagnostics summary' },
                    { label: 'Terminal / task output' },
                    { label: 'Key config files' },
                    { label: 'Git metadata' }
                ],
                {
                    title: 'ContextBridge — Compose Context',
                    canPickMany: true,
                    ignoreFocusOut: true
                }
            );
    
            if (!picks || picks.length === 0) {
                return;
            }
    
            const selected = picks.map(p => p.label);
    
            const composition: ContextComposition = {
                intent: intent.trim() || null,
                include: {
                    repoStructure: selected.includes('Repo structure'),
                    contextDelta: selected.includes('Context delta (changes since last sync)'),
                    activeFile: selected.includes('Active file'),
                    diagnostics: selected.includes('Diagnostics summary'),
                    terminal: selected.includes('Terminal / task output'),
                    keyFiles: selected.includes('Key config files'),
                    git: selected.includes('Git metadata')
                }
            };
    
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }
    
            const contextText = await contextBridge.syncRepo(
                workspaceFolder,
                composition
            );
    
            await vscode.env.clipboard.writeText(contextText);
    
            vscode.window.showInformationMessage(
                'ContextBridge: Context copied to clipboard'
            );
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
                vscode.window.showInformationMessage(
                    'ContextBridge: File content copied to clipboard'
                );
            } catch (error) {
                vscode.window.showErrorMessage(`ContextBridge error: ${error}`);
            }
        }
    );

    // Status Bar button for "Sync Repo"
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
