import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface FileState {
    mtime: number;
    size: number;
}

interface SyncState {
    lastSyncTime: number;
    fileStates: { [filePath: string]: FileState };
}

/**
 * ContextBridge: Deterministic context synchronization
 * 
 * Architecture:
 * - Repo Analyzer: Reads workspace files and diagnostics
 * - Context Selector: Decides normal sync vs deep sync
 * - Context Compiler: Formats context into human-readable blocks
 * - UX Layer: VS Code commands + clipboard (handled in extension.ts)
 */
export class ContextBridge {
    private stateKey = 'contextbridge.syncState';

    constructor(private workspaceState: vscode.Memento) {}

    /**
     * Sync Repo → Chat
     * First sync: project primer
     * Subsequent syncs: incremental updates
     */
    async syncRepo(
        workspaceFolder: vscode.WorkspaceFolder,
        composition: {
            intent: string | null;
            include: Record<string, boolean>;
        }
    ): Promise<string> {
        const savedState = this.workspaceState.get<SyncState>(this.stateKey);
        const isFirstSync = !savedState;

        if (isFirstSync) {
            return this.compileProjectPrimer(workspaceFolder, composition);
        } else {
            return this.compileIncrementalUpdate(workspaceFolder, savedState, composition);
        }
    }

    /**
     * Deep Sync Current File → Chat
     * Sends full content of ONE file only
     */
    async deepSyncFile(document: vscode.TextDocument): Promise<string> {
        const filePath = document.fileName;
        const content = document.getText();
        const diagnostics = vscode.languages.getDiagnostics(document.uri);

        return this.compileDeepSync(filePath, content, diagnostics);
    }
    

    /**
     * Compile project primer (first sync)
     */
    private async compileProjectPrimer(
        workspaceFolder: vscode.WorkspaceFolder,
        composition: { intent: string | null }
    ): Promise<string> {
        
        const rootPath = workspaceFolder.uri.fsPath;
        const projectStructure = this.getProjectStructure(rootPath);
        const keyFiles = this.getKeyFiles(rootPath);
        const activeFile = this.getActiveFileInfo();

        // Save initial state
        const fileStates = await this.buildFileStates(rootPath);
        this.workspaceState.update(this.stateKey, {
            lastSyncTime: Date.now(),
            fileStates
        } as SyncState);

        const blocks: string[] = [];

        blocks.push('# ContextBridge: Project Primer');
        blocks.push(`Workspace: ${workspaceFolder.name}`);
        blocks.push(`Sync Time: ${new Date().toISOString()}`);
        blocks.push('');

        if (composition.intent) {
            blocks.push('## User Intent');
            blocks.push(composition.intent);
            blocks.push('');
        }
        

        // Project Description
        const projectDescription = this.getProjectDescription(keyFiles, rootPath);
        if (projectDescription) {
            blocks.push(
                `## Project Description${projectDescription.isInferred ? ' (Inferred)' : ''}`
            );
            blocks.push(projectDescription.text);
            blocks.push('');
        }

        blocks.push('## Project Structure');
        blocks.push('```');
        blocks.push(projectStructure);
        blocks.push('```');
        blocks.push('');

        if (keyFiles.length > 0) {
            blocks.push('## Key Files');
            for (const file of keyFiles) {
                blocks.push(`### ${file.name}`);
                blocks.push(`Path: ${file.relativePath}`);
                if (file.preview) {
                    blocks.push('```');
                    blocks.push(file.preview);
                    blocks.push('```');
                }
                blocks.push('');
            }
        }

        if (activeFile) {
            blocks.push('## Active File');
            blocks.push(`Path: ${activeFile.path}`);
            blocks.push(`Language: ${activeFile.language}`);
            blocks.push('');
        }

        return blocks.join('\n');
    }

    /**
     * Compile incremental update (subsequent syncs)
     */
    private async compileIncrementalUpdate(
        workspaceFolder: vscode.WorkspaceFolder,
        savedState: SyncState,
        composition: { intent: string | null }
    ): Promise<string> {
    
        const rootPath = workspaceFolder.uri.fsPath;
        const currentFileStates = await this.buildFileStates(rootPath);
        const changes = this.detectChanges(savedState.fileStates, currentFileStates, rootPath);

        // Update saved state
        this.workspaceState.update(this.stateKey, {
            lastSyncTime: Date.now(),
            fileStates: currentFileStates
        } as SyncState);

        const blocks: string[] = [];

        blocks.push('# ContextBridge: Incremental Update');
        blocks.push(`Workspace: ${workspaceFolder.name}`);
        blocks.push(`Sync Time: ${new Date().toISOString()}`);
        blocks.push(`Last Sync: ${new Date(savedState.lastSyncTime).toISOString()}`);
        blocks.push('');

        if (composition.intent) {
            blocks.push('## User Intent');
            blocks.push(composition.intent);
            blocks.push('');
        }
        

        if (changes.modified.length === 0 && changes.added.length === 0) {
            blocks.push('No changes detected since last sync.');
            blocks.push('');
        } else {
            if (changes.modified.length > 0) {
                blocks.push('## Modified Files');
                for (const filePath of changes.modified) {
                    const relativePath = path.relative(rootPath, filePath);
                    blocks.push(`- ${relativePath}`);
                }
                blocks.push('');
            }

            if (changes.added.length > 0) {
                blocks.push('## New Files');
                for (const filePath of changes.added) {
                    const relativePath = path.relative(rootPath, filePath);
                    blocks.push(`- ${relativePath}`);
                }
                blocks.push('');
            }

            if (changes.removed.length > 0) {
                blocks.push('## Removed Files');
                for (const filePath of changes.removed) {
                    const relativePath = path.relative(rootPath, filePath);
                    blocks.push(`- ${relativePath}`);
                }
                blocks.push('');
            }
        }

        const activeFile = this.getActiveFileInfo();
        if (activeFile) {
            blocks.push('## Active File');
            blocks.push(`Path: ${activeFile.path}`);
            blocks.push(`Language: ${activeFile.language}`);
            blocks.push('');
        }

        return blocks.join('\n');
    }

    /**
     * Compile deep sync (full file content)
     */
    private compileDeepSync(
        filePath: string,
        content: string,
        diagnostics: vscode.Diagnostic[]
    ): string {
        const blocks: string[] = [];

        blocks.push('# ContextBridge: Deep Sync');
        blocks.push(`File: ${filePath}`);
        blocks.push(`Sync Time: ${new Date().toISOString()}`);
        blocks.push('');

        if (diagnostics.length > 0) {
            blocks.push('## Diagnostics');
            for (const diag of diagnostics) {
                const severityLabel = this.getDiagnosticSeverityLabel(diag.severity);
                blocks.push(`- [${severityLabel}] ${diag.message} (Line ${diag.range.start.line + 1})`);
            }
            blocks.push('');
        }

        blocks.push('## File Content');
        blocks.push('```');
        blocks.push(content);
        blocks.push('```');

        return blocks.join('\n');
    }

    /**
     * Get project structure as a directory tree
     */
    private getProjectStructure(rootPath: string, maxDepth: number = 3): string {
        const ignorePatterns = [
            'node_modules',
            '.git',
            '.vscode',
            'out',
            'dist',
            'build',
            '.next',
            '.cache'
        ];

        const lines: string[] = [];
        
        const walk = (dir: string, prefix: string, depth: number): void => {
            if (depth > maxDepth) return;

            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true })
                    .filter(entry => !ignorePatterns.includes(entry.name))
                    .filter(entry => !entry.name.startsWith('.'))
                    .slice(0, 20); // Limit entries per directory

                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i];
                    const isLast = i === entries.length - 1;
                    const currentPrefix = isLast ? '└── ' : '├── ';
                    const nextPrefix = isLast ? '    ' : '│   ';

                    lines.push(prefix + currentPrefix + entry.name);

                    if (entry.isDirectory()) {
                        const fullPath = path.join(dir, entry.name);
                        walk(fullPath, prefix + nextPrefix, depth + 1);
                    }
                }
            } catch (error) {
                // Skip directories we can't read
            }
        };

        const rootName = path.basename(rootPath);
        lines.push(rootName);
        walk(rootPath, '', 0);

        return lines.join('\n');
    }

    /**
     * Get key files (package.json, README, etc.)
     */
    private getKeyFiles(rootPath: string): Array<{ name: string; relativePath: string; preview?: string }> {
        const keyFileNames = [
            'package.json',
            'README.md',
            'README.txt',
            'tsconfig.json',
            'package-lock.json',
            'yarn.lock',
            'Cargo.toml',
            'go.mod',
            'requirements.txt',
            'Pipfile'
        ];

        const files: Array<{ name: string; relativePath: string; preview?: string }> = [];

        for (const fileName of keyFileNames) {
            const filePath = path.join(rootPath, fileName);
            if (fs.existsSync(filePath)) {
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    // Preview first 20 lines
                    const preview = content.split('\n').slice(0, 20).join('\n');
                    files.push({
                        name: fileName,
                        relativePath: fileName,
                        preview
                    });
                } catch (error) {
                    files.push({
                        name: fileName,
                        relativePath: fileName
                    });
                }
            }
        }

        return files;
    }

    /**
     * Get active file info
     */
    private getActiveFileInfo(): { path: string; language: string } | null {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }

        return {
            path: editor.document.fileName,
            language: editor.document.languageId
        };
    }

    /**
     * Build file states map for change detection
     */
    private async buildFileStates(rootPath: string): Promise<{ [filePath: string]: FileState }> {
        const fileStates: { [filePath: string]: FileState } = {};
        const ignorePatterns = [
            'node_modules',
            '.git',
            '.vscode',
            'out',
            'dist',
            'build',
            '.next',
            '.cache'
        ];

        const walk = (dir: string): void => {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });

                for (const entry of entries) {
                    if (ignorePatterns.includes(entry.name) || entry.name.startsWith('.')) {
                        continue;
                    }

                    const fullPath = path.join(dir, entry.name);

                    if (entry.isDirectory()) {
                        walk(fullPath);
                    } else if (entry.isFile()) {
                        try {
                            const stats = fs.statSync(fullPath);
                            fileStates[fullPath] = {
                                mtime: stats.mtimeMs,
                                size: stats.size
                            };
                        } catch (error) {
                            // Skip files we can't stat
                        }
                    }
                }
            } catch (error) {
                // Skip directories we can't read
            }
        };

        walk(rootPath);
        return fileStates;
    }

    /**
     * Detect changes between saved state and current state
     */
    private detectChanges(
        savedStates: { [filePath: string]: FileState },
        currentStates: { [filePath: string]: FileState },
        rootPath: string
    ): { modified: string[]; added: string[]; removed: string[] } {
        const modified: string[] = [];
        const added: string[] = [];
        const removed: string[] = [];

        // Check for modified and new files
        for (const filePath in currentStates) {
            const saved = savedStates[filePath];
            const current = currentStates[filePath];

            if (!saved) {
                added.push(filePath);
            } else if (saved.mtime !== current.mtime || saved.size !== current.size) {
                modified.push(filePath);
            }
        }

        // Check for removed files
        for (const filePath in savedStates) {
            if (!currentStates[filePath]) {
                removed.push(filePath);
            }
        }

        return { modified, added, removed };
    }

    /**
    * Get project description from README or infer from filesystem
    */
    private getProjectDescription(
        keyFiles: Array<{ name: string; relativePath: string; preview?: string }>,
        rootPath: string
    ): { text: string; isInferred: boolean } | null {
        // Try to extract from README first
        const readmeFile = keyFiles.find(file =>
            file.name === 'README.md' || file.name === 'README.txt'
        );

        if (readmeFile && readmeFile.preview) {
            const lines = readmeFile.preview.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (
                    trimmed &&
                    !trimmed.startsWith('#') &&
                    trimmed.length > 10 &&
                    !this.isBoilerplateDescription(trimmed)
                ) {
                    return { text: trimmed, isInferred: false };
                }
            }
        }

        // Infer from filesystem indicators
        const inferredDescription = this.inferProjectDescription(rootPath);
        if (inferredDescription) {
            return { text: inferredDescription, isInferred: true };
        }

        return null;
    }


    /**
 * Detect low-signal / boilerplate README descriptions
 */
    private isBoilerplateDescription(text: string): boolean {
        const boilerplatePatterns = [
            'this template provides',
            'react + vite',
            'minimal setup',
            'starter template',
            'boilerplate',
            'getting started',
            'create-react-app',
            'vite + react'
        ];

        const lower = text.toLowerCase();
        return boilerplatePatterns.some(pattern => lower.includes(pattern));
    }


    /**
     * Infer project description from filesystem structure
     */
    private inferProjectDescription(rootPath: string): string | null {
        const indicators: string[] = [];

        // Check for common framework/directory patterns
        if (fs.existsSync(path.join(rootPath, 'src', 'app'))) {
            indicators.push('Next.js application');
        } else if (fs.existsSync(path.join(rootPath, 'src', 'pages'))) {
            indicators.push('Next.js application');
        } else if (fs.existsSync(path.join(rootPath, 'app'))) {
            indicators.push('application');
        }

        if (fs.existsSync(path.join(rootPath, 'prisma'))) {
            indicators.push('database integration');
        }

        if (fs.existsSync(path.join(rootPath, 'src', 'components'))) {
            indicators.push('component-based architecture');
        }

        if (fs.existsSync(path.join(rootPath, 'src', 'api'))) {
            indicators.push('API endpoints');
        }

        if (indicators.length > 0) {
            return `This project appears to be a ${indicators.join(' with ')}.`;
        }

        return null;
    }

    /**
     * Convert diagnostic severity number to human-readable label
     */
    private getDiagnosticSeverityLabel(severity: vscode.DiagnosticSeverity): string {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error:
                return 'Error';
            case vscode.DiagnosticSeverity.Warning:
                return 'Warning';
            case vscode.DiagnosticSeverity.Information:
                return 'Info';
            case vscode.DiagnosticSeverity.Hint:
                return 'Hint';
            default:
                return 'Unknown';
        }
    }
}

