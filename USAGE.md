# DNAnexus Explorer Extension Usage Guide

This guide explains how to use the DNAnexus Explorer Extension for Visual Studio Code.

## Requirements

- Visual Studio Code version 1.74.0 or later
- DNAnexus Command Line Interface (CLI) installed and properly configured
- Active DNAnexus account with appropriate permissions

## Getting Started

1. **Install the Extension**:
   - Install from the VS Code marketplace or use the VSIX file
   - When first activated, the extension will automatically detect your DNAnexus CLI installation

2. **Project Selection**:
   - Use the Project Selector view to choose a DNAnexus project
   - Click on a project to set it as active
   - You can add projects to your workspace for quick access

## File Explorer

The DNAnexus File Explorer lets you browse and manage files in your DNAnexus projects:

- Browse folders and files in the current project
- Upload files via drag and drop or through the context menu
- Download files to your local system
- Create new folders
- Delete files and folders
- Copy file IDs for reference in workflows

## Job Explorer

Monitor and manage your DNAnexus jobs:

- View all jobs in the current project
- Check job status (running, completed, failed)
- Terminate running jobs
- Rerun completed or failed jobs
- Open job details in the DNAnexus web interface

## App Explorer

Discover and use DNAnexus apps:

- Browse available apps
- View app details
- Create run templates for frequently used apps
- Edit existing templates
- Run applications with saved templates

## Tips and Tricks

- Use the refresh button to update views when changes are made outside the extension
- Create multiple templates for different parameter configurations of the same app
- Organize your files in folders for better project management
- Keep the DNAnexus CLI updated to ensure compatibility with the extension
