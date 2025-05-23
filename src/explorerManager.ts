import * as vscode from 'vscode';
import { DxFileExplorer } from './dxFileExplorer';
import { DxJobExplorer } from './dxJobExplorer';
import { DxFileOperations } from './services/dxFileOperations';
import { DxCli } from './dxCli';
import { DxNode } from './dxNode';
import { ProjectManager } from './services/projectManager';

export function initializeExplorers(context: vscode.ExtensionContext) {
    try {
        const dxCli = new DxCli(context.extensionPath);
        const fileOperations = new DxFileOperations(dxCli);
        const fileExplorer = new DxFileExplorer(context);
        const jobExplorer = new DxJobExplorer(context);

        registerFileCommands(context, fileExplorer, fileOperations);
        registerFolderCommands(context, fileExplorer, fileOperations); // Corrected: registerFolderCommands

        context.subscriptions.push(fileExplorer, jobExplorer);

        const projectManager = ProjectManager.getInstance();
        const activeProjectId = projectManager.getActiveProject();

        if (activeProjectId) {
            console.log(`Extension: Loading initial content for project ${activeProjectId}`);
            fileExplorer.refresh();
            jobExplorer.refresh();
        }
    } catch (error) {
        console.error("Error initializing explorers:", error);
        vscode.window.showErrorMessage("Failed to initialize DNAnexus explorers");
    }
}

function registerFileCommands(context: vscode.ExtensionContext, fileExplorer: DxFileExplorer, fileOperations: DxFileOperations) {
    const renameFileCmd = vscode.commands.registerCommand('dx-vscode.renameFile', async (node?: DxNode) => {
        let effectiveNode = node;
        if (!effectiveNode) {
            const selectedNode = fileExplorer.getSelectedNode();
            if (!selectedNode || selectedNode.isDirectory) {
                vscode.window.showWarningMessage('Please select a file in the DNAnexus File Explorer to rename.');
                return;
            }
            effectiveNode = selectedNode;
        }

        if (!effectiveNode) {
            vscode.window.showErrorMessage('No file selected for renaming.');
            return;
        }

        const newName = await vscode.window.showInputBox({
            prompt: `Enter new name for ${effectiveNode.label}`,
            value: effectiveNode.label,
            validateInput: (value) => {
                if (!value || value.trim() === '') {
                    return 'File name cannot be empty.';
                }
                if (value.includes('/')) {
                    return 'File name cannot contain path separators (/).';
                }
                return null;
            }
        });

        if (newName && effectiveNode) {
            const success = await fileOperations.renameFile(effectiveNode, newName.trim());
            if (success) {
                fileExplorer.refresh();
            }
        }
    });
    context.subscriptions.push(renameFileCmd);
}

function registerFolderCommands(context: vscode.ExtensionContext, fileExplorer: DxFileExplorer, fileOperations: DxFileOperations) {
    const renameFolderCmd = vscode.commands.registerCommand('dx-vscode.renameFolder', async (node?: DxNode) => {
        let effectiveNode = node;
        if (!effectiveNode) {
            const selectedNode = fileExplorer.getSelectedNode();
            if (!selectedNode || !selectedNode.isDirectory) {
                vscode.window.showWarningMessage('Please select a folder in the DNAnexus File Explorer to rename.');
                return;
            }
            effectiveNode = selectedNode;
        }

        if (!effectiveNode) {
            vscode.window.showErrorMessage('No folder selected for renaming.');
            return;
        }

        const newName = await vscode.window.showInputBox({
            prompt: `Enter new name for ${effectiveNode.label}`,
            value: effectiveNode.label,
            validateInput: (value) => {
                if (!value || value.trim() === '') {
                    return 'Folder name cannot be empty.';
                }
                if (value.includes('/')) {
                    return 'Folder name cannot contain path separators (/).';
                }
                return null;
            }
        });

        if (newName && effectiveNode) {
            // Assuming renameFile can also handle folders, or a specific renameFolder method exists
            const success = await fileOperations.renameFile(effectiveNode, newName.trim()); 
            if (success) {
                fileExplorer.refresh();
            }
        }
    });
    context.subscriptions.push(renameFolderCmd);
}
