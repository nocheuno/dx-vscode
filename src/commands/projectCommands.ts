import * as vscode from 'vscode';
import { ProjectManager } from '../services/projectManager';

export function registerProjectCommands(context: vscode.ExtensionContext) {
    const projectManager = ProjectManager.getInstance(context);
    context.subscriptions.push({
        dispose: () => {
            console.log('Disposing ProjectManager resources');
        }
    });

    const setProjectCmd = vscode.commands.registerCommand('dx-vscode.setProject', async (projectId: string) => {
        await projectManager.setActiveProject(projectId);
        vscode.window.showInformationMessage(`Switched to project: ${projectId}`);
    });
    context.subscriptions.push(setProjectCmd);
}

export function handleProjectInitializationError(error: any) {
    if (error.message && error.message.includes('DNAnexus DX CLI not found')) {
        const message = 'DNAnexus CLI not found. You need to activate your dxpy Python environment first.';
        const openSettings = 'Configure Path';
        const viewDocs = 'How to Fix';
        const openTerminal = 'Open Terminal';

        vscode.window.showErrorMessage(message, openSettings, viewDocs, openTerminal).then(selection => {
            if (selection === openSettings) {
                vscode.commands.executeCommand('workbench.action.openSettings', 'dx-vscode.cliPath');
            } else if (selection === viewDocs) {
                vscode.window.showInformationMessage(
                    'To fix this issue:\n' +
                    '1. Activate your dxpy virtual environment in a terminal (e.g., "source dxpy-venv/bin/activate")\n' +
                    '2. Find the path to dx CLI with "which dx"\n' +
                    '3. Copy this path and set it in VS Code settings (dx-vscode.cliPath)'
                );
            } else if (selection === openTerminal) {
                const terminal = vscode.window.createTerminal('DNAnexus Environment');
                terminal.show();
                terminal.sendText('# Activate your dxpy environment, for example:');
                terminal.sendText('# source ~/dxpy-venv/bin/activate');
                terminal.sendText('echo "After activating your environment, run:"');
                terminal.sendText('echo "which dx"');
                terminal.sendText('echo "Then copy this path to VS Code settings: dx-vscode.cliPath"');
            }
        });
    } else {
        throw error;
    }
}
