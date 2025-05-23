# Simplify Active Project Management

## Changes

This PR simplifies the management of active projects in the DNAnexus VS Code extension by:

1. Creating a new `ProjectManager` service that centralizes active project management
2. Refactoring `DxFileExplorer`, `DxJobExplorer`, and `ProjectSelector` to use this service
3. Removing redundant code and simplifying the flow of active project state

### Before

Before this change:
- Each explorer maintained its own copy of the active project ID
- Active project synchronization was done via commands and events
- Project state was stored redundantly in multiple locations
- Components had to explicitly coordinate with each other

### After

After this change:
- `ProjectManager` service is the single source of truth for active project
- Components subscribe to `ProjectManager.onProjectChanged` event
- Centralized project state storage in workspace state
- No more command-based synchronization between components

## Testing

The changes have been tested by:
- Verifying that all components use the same active project ID
- Changing projects in one component updates all others
- Initial project selection works as before
- All file and job operations use the correct project ID
