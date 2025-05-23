# DNAnexus CLI Setup for VS Code Extension

This VS Code extension requires the DNAnexus Command Line Interface (DX CLI) tool to function properly. The DX CLI is part of the `dxpy` Python package.

## Prerequisites

- Python (3.6 or later recommended)
- pip (Python package manager)

## Setup Instructions

### Step 1: Install dxpy in a Virtual Environment

It's recommended to install dxpy in a dedicated Python virtual environment:

> **IMPORTANT**: If you encounter "DNAnexus DX CLI not found" errors, follow these instructions carefully.

```bash
# Create a virtual environment
python -m venv dxpy-venv

# Activate the virtual environment
# On macOS/Linux:
source dxpy-venv/bin/activate
# On Windows:
# dxpy-venv\Scripts\activate

# Install dxpy
pip install dxpy
```

### Step 2: Verify DX CLI Installation

After installing dxpy, verify that the DX CLI is available:

```bash
which dx
# This should output something like: /path/to/dxpy-venv/bin/dx
```

### Step 3: Configure the VS Code Extension

There are two ways to use the extension with your DX CLI:

#### Option 1: Activate the Virtual Environment Before Starting VS Code

Before starting VS Code, activate your virtual environment in the terminal:

```bash
source dxpy-venv/bin/activate
code .
```

This will make the `dx` command available in your PATH when VS Code starts.

#### Option 2: Configure the DX CLI Path in VS Code Settings

1. Copy the full path to your DX CLI executable (from the `which dx` command)
2. In VS Code, open Settings (Ctrl+, or Cmd+,)
3. Search for "dx-vscode.cliPath"
4. Paste the full path to your DX CLI executable

## Troubleshooting

If you encounter the error "DNAnexus DX CLI not found", try the following:

1. Confirm that dxpy is installed in your virtual environment
2. Verify the path to the DX CLI using `which dx` in an activated environment
3. Make sure you've properly configured the DX CLI path in VS Code settings
4. Try restarting VS Code after activating your virtual environment

## Login to DNAnexus

After setting up the DX CLI, you need to log in to DNAnexus:

```bash
dx login
```

Follow the prompts to complete the login process.
