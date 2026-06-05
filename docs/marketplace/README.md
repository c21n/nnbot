# NNBot Plugin Marketplace

Welcome to the NNBot Plugin Marketplace! This guide will help you discover, install, and manage plugins for your NNBot instance.

## Quick Start

### Accessing the Marketplace

1. **Web UI**: Visit `http://your-nnbot-host:3000/marketplace/`
2. **Command**: Use `/plugin` commands in chat

### Browsing Plugins

**Web UI**:
- Visit the marketplace homepage
- Use the search bar to find plugins
- Browse by category using the category tags
- Check out popular and recommended plugins

**Command**:
```
/plugin search <keyword>
/plugin popular
/plugin recommended
```

### Installing Plugins

**Web UI**:
1. Find a plugin you want to install
2. Click on the plugin card to view details
3. Click the "Install" button
4. Wait for installation to complete

**Command**:
```
/plugin install <plugin-id>
```

Example:
```
/plugin install username/plugin-name
```

### Viewing Installed Plugins

**Web UI**:
- Click "Installed" in the navigation bar
- See all installed plugins with their status

**Command**:
```
/plugin list
```

### Updating Plugins

**Web UI**:
1. Go to the "Installed" page
2. Click "Update" next to a plugin with an available update
3. Or click "Update All" to update all plugins

**Command**:
```
/plugin update <plugin-id>
/plugin update --all
```

### Uninstalling Plugins

**Web UI**:
1. Go to the "Installed" page
2. Click "Uninstall" next to the plugin you want to remove
3. Confirm the uninstallation

**Command**:
```
/plugin uninstall <plugin-id>
```

## Plugin Commands Reference

| Command | Description |
|---------|-------------|
| `/plugin search <query>` | Search plugins by keyword |
| `/plugin info <plugin-id>` | View plugin details |
| `/plugin install <plugin-id>` | Install a plugin |
| `/plugin uninstall <plugin-id>` | Uninstall a plugin |
| `/plugin update <plugin-id>` | Update a single plugin |
| `/plugin update --all` | Update all plugins |
| `/plugin list` | List installed plugins |
| `/plugin popular` | View popular plugins |
| `/plugin recommended` | View recommended plugins |
| `/plugin help` | Show command help |

## Plugin ID Format

Plugin IDs follow the format: `username/plugin-name`

Examples:
- `nnbot/ai-chat`
- `user/weather-plugin`
- `admin/moderation`

## Auto-Updates

The marketplace plugin automatically checks for updates every 24 hours. When updates are available, you'll be notified in the chat.

To disable auto-updates, you can unload the marketplace plugin:
```
/admin unload marketplace
```

## Troubleshooting

### Plugin Not Found

If you see "Plugin not found":
- Check the plugin ID format (`username/plugin-name`)
- Make sure the plugin exists in the marketplace
- Try searching for the plugin first

### Installation Failed

If installation fails:
- Check your internet connection
- Verify the plugin file is valid
- Check the error message for details

### Update Not Available

If no update is available:
- The plugin is already at the latest version
- The marketplace may not have the latest version yet

### Plugin Not Working

If a plugin isn't working after installation:
1. Check if the plugin is enabled (`/plugin list`)
2. Restart NNBot to reload plugins
3. Check the plugin's documentation for configuration

## Getting Help

- **Documentation**: Check the plugin's README for specific instructions
- **Issues**: Report issues on the plugin's repository
- **Support**: Ask for help in the NNBot community

## For Developers

Want to publish your own plugin? See the [Developer Guide](development.md) for instructions on:
- Creating plugins
- Testing plugins
- Publishing to the marketplace
- Best practices
