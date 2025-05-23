import * as vscode from 'vscode';

// Import local modules
import { ProjectManager } from './services/projectManager';
import { ProjectSelector } from './projectSelector';
import { DxFileExplorer } from './dxFileExplorer';
import { DxJobExplorer } from './dxJobExplorer';

// Create a shared status bar item for DNAnexus operations
export const dxStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

export function activate(context: vscode.ExtensionContext) {
	// Initialize status bar item
	dxStatusBarItem.text = '$(cloud) DNAnexus';
	dxStatusBarItem.tooltip = 'DNAnexus Platform';
	dxStatusBarItem.command = 'dx-vscode.checkEnvironment';
	dxStatusBarItem.show();
	context.subscriptions.push(dxStatusBarItem);
	
	// Add command to check environment
	const checkEnvCmd = vscode.commands.registerCommand('dx-vscode.checkEnvironment', () => {
		const terminal = vscode.window.createTerminal('DNAnexus Environment');
		terminal.show();
		terminal.sendText('echo "Checking DNAnexus environment..."');
		terminal.sendText('if command -v dx > /dev/null; then');
		terminal.sendText('  echo "✅ dx CLI found: $(which dx)"');
		terminal.sendText('  echo "✅ Version: $(dx --version)"');
		terminal.sendText('  echo "✅ Current user: $(dx whoami)"');
		terminal.sendText('else');
		terminal.sendText('  echo "❌ dx CLI not found in PATH"');
		terminal.sendText('  echo "To activate your dxpy environment, run:"');
		terminal.sendText('  echo "source ~/dxpy-venv/bin/activate"');
		terminal.sendText('fi');
	});
	context.subscriptions.push(checkEnvCmd);	try {
		// Initialize ProjectManager first as a central service
		const projectManager = ProjectManager.getInstance(context);
		
		// Register ProjectManager as a disposable resource
		context.subscriptions.push({
			dispose: () => {
				console.log('Disposing ProjectManager resources');
				// Any additional cleanup if needed
			}
		});
		
		// Initialize Project Selector
		const projectSelector = new ProjectSelector(context);
		context.subscriptions.push(projectSelector);
		
		// Register commands for project operations
		const setProjectCmd = vscode.commands.registerCommand('dx-vscode.setProject', async (projectId: string) => {
			await projectManager.setActiveProject(projectId);
			vscode.window.showInformationMessage(`Switched to project: ${projectId}`);
		});
		context.subscriptions.push(setProjectCmd);
	} catch (error: any) {
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
	}	// After ProjectManager is initialized, create the File Explorer and Job Explorer directly
	try {
		// Initialize explorers directly
		const fileExplorer = new DxFileExplorer(context);
		const jobExplorer = new DxJobExplorer(context);
		
		// Store explorers in extension context for easy access
		context.subscriptions.push(fileExplorer, jobExplorer);
		
		// Get the active project from ProjectManager and refresh views if needed
		const projectManager = ProjectManager.getInstance();
		const activeProjectId = projectManager.getActiveProject();
		
		if (activeProjectId) {
			console.log(`Extension: Loading initial content for project ${activeProjectId}`);
			// Each explorer will get the active project ID from ProjectManager internally
			fileExplorer.refresh();
			jobExplorer.refresh();
		}
		// Register commands for file explorer
		context.subscriptions.push(			// vscode.commands.registerCommand('dxFileExplorer.openFile', (node) => fileExplorer.openFile(node)),
			vscode.commands.registerCommand('dxFileExplorer.describeFile', (node) => fileExplorer.describeFile(node)),
			vscode.commands.registerCommand('dxFileExplorer.previewFile', (node) => fileExplorer.previewFile(node)),
			vscode.commands.registerCommand('dxFileExplorer.refresh', () => fileExplorer.refresh())
		);
	} catch (error) {
		console.error("Error initializing explorers:", error);
		vscode.window.showErrorMessage("Failed to initialize DNAnexus explorers");
	}
}
