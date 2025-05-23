import * as vscode from 'vscode';

// Import local modules
// import { ProjectManager } from './services/projectManager'; // No longer directly used here
import { ProjectSelector } from './projectSelector';
import { SessionManager } from './services/sessionManager';
import { initializeStatusBar } from './statusBar'; // dxStatusBarItem is not directly used here
import { registerCheckEnvironmentCommand } from './commands/checkEnvironment';
import { registerProjectCommands, handleProjectInitializationError } from './commands/projectCommands';
import { initializeExplorers } from './explorerManager';

export function activate(context: vscode.ExtensionContext) {
	// Initialize status bar item
	initializeStatusBar(context);

	// Initialize SessionManager
	const sessionManager = new SessionManager();
	context.subscriptions.push(sessionManager);
	
	// Add command to check environment
	registerCheckEnvironmentCommand(context);

	try {
		// Initialize Project Selector
		const projectSelector = new ProjectSelector(context);
		context.subscriptions.push(projectSelector);
		
		// Register commands for project operations
		registerProjectCommands(context);

	} catch (error: any) {
		handleProjectInitializationError(error);
	}
	// After ProjectManager is initialized, create the File Explorer and Job Explorer directly
	initializeExplorers(context);
}
