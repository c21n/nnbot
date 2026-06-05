# Plugin Development Guide

This guide explains how to create, test, and publish plugins for the NNBot Plugin Marketplace.

## Getting Started

### Prerequisites

- Node.js 18+
- NNBot instance running
- GitHub account (for publishing)

### Plugin Structure

A basic plugin looks like this:

```javascript
// my-plugin.js
export default {
  name: 'my-plugin',
  description: 'A simple plugin',
  version: '1.0.0',

  async handle(event, services) {
    // Handle the event
    if (event.message === '/hello') {
      return { content: 'Hello, World!' };
    }
    return null; // Let other plugins handle this event
  }
};
```

### Plugin Interface

```typescript
interface PluginDefinition {
  // Required
  name: string;                    // Plugin name (lowercase, hyphens)
  handle(event, services): Response | null;  // Event handler

  // Optional
  description?: string;            // Plugin description
  version?: string;                // Version (semver)
  priority?: number;               // Execution priority (lower = earlier)
  help?: string | (() => string);  // Help text
  hooks?: AIChatHooks;             // AI chat hooks
  onLoad?(services): Promise<void>;    // Lifecycle: loaded
  onUnload?(): Promise<void>;          // Lifecycle: unloaded
}
```

### Event Object

```typescript
interface Event {
  readonly type: EventType;        // PRIVATE_MESSAGE or GROUP_MESSAGE
  readonly userId: string;         // User ID
  readonly nickname: string;       // User nickname
  readonly groupId: string | null; // Group ID (null for private messages)
  readonly groupName: string | null;
  readonly message: string;        // Message content
  readonly timestamp: number;      // Unix timestamp
  readonly raw: Record<string, unknown>; // Raw event data
}
```

### Response Object

```typescript
interface Response {
  readonly content: string;        // Reply content
  readonly replyTo?: boolean;      // Quote the original message
  readonly atSender?: boolean;     // @ the sender
  readonly extra?: Record<string, unknown>; // Extra data
}
```

### Services Object

```typescript
interface PluginServices {
  readonly llm: ILLMService;           // LLM service
  readonly storage: IStorage;          // Storage service
  readonly config: Config;             // Configuration
  readonly pluginManager: IPluginManager; // Plugin manager
  readonly hooks: AIChatHooks;         // AI chat hooks
  readonly toolRegistry: IToolRegistry; // Tool registry
  readonly providers: ProviderManager; // Provider manager
}
```

## Creating a Plugin

### Step 1: Create the Plugin File

Create a new `.js` file in your project:

```javascript
// weather-plugin.js
export default {
  name: 'weather',
  description: 'Get weather information',
  version: '1.0.0',

  async handle(event, services) {
    if (!event.message.startsWith('/weather')) {
      return null;
    }

    const city = event.message.replace('/weather', '').trim();
    if (!city) {
      return { content: 'Usage: /weather <city>' };
    }

    // Fetch weather data
    try {
      const weather = await getWeather(city);
      return {
        content: `🌤️ Weather in ${city}: ${weather.temp}°C, ${weather.condition}`
      };
    } catch (err) {
      return { content: `❌ Failed to get weather: ${err.message}` };
    }
  }
};

async function getWeather(city) {
  // Implementation here
  return { temp: 20, condition: 'Sunny' };
}
```

### Step 2: Test the Plugin

1. Copy the plugin file to your NNBot `plugins/` directory
2. Restart NNBot or use `/admin reload`
3. Test the plugin in chat

### Step 3: Add Help Text

```javascript
export default {
  name: 'weather',
  description: 'Get weather information',
  version: '1.0.0',

  help() {
    return `
🌤️ Weather Plugin

Commands:
  /weather <city>    Get weather for a city

Examples:
  /weather Beijing
  /weather Tokyo
    `.trim();
  },

  async handle(event, services) {
    // ...
  }
};
```

## Advanced Features

### Using AI Chat Hooks

Hooks allow you to intercept and modify AI chat behavior:

```javascript
export default {
  name: 'context-enhancer',
  description: 'Enhance AI context with custom data',
  version: '1.0.0',

  hooks: {
    async beforeLLM(messages, event) {
      // Add custom context before LLM call
      const context = await getCustomContext(event.userId);
      return [
        ...messages,
        { role: 'system', content: `User context: ${context}` }
      ];
    },

    async afterLLM(response, event) {
      // Modify response after LLM call
      return response.replace(/bad words/gi, '***');
    }
  }
};
```

### Using Storage

```javascript
export default {
  name: 'counter',
  description: 'Count user messages',
  version: '1.0.0',

  async handle(event, services) {
    if (event.message === '/count') {
      const count = await services.storage.get(`count:${event.userId}`) || 0;
      return { content: `You've sent ${count} messages.` };
    }

    // Increment counter
    const count = await services.storage.get(`count:${event.userId}`) || 0;
    await services.storage.set(`count:${event.userId}`, count + 1);
    return null;
  }
};
```

### Using LLM Service

```javascript
export default {
  name: 'summarizer',
  description: 'Summarize text using AI',
  version: '1.0.0',

  async handle(event, services) {
    if (!event.message.startsWith('/summarize')) {
      return null;
    }

    const text = event.message.replace('/summarize', '').trim();
    if (!text) {
      return { content: 'Usage: /summarize <text>' };
    }

    const summary = await services.llm.chat([
      { role: 'system', content: 'Summarize the following text in one sentence.' },
      { role: 'user', content: text }
    ]);

    return { content: `📝 Summary: ${summary}` };
  }
};
```

## Best Practices

### 1. Handle Errors Gracefully

```javascript
async handle(event, services) {
  try {
    // Your code here
  } catch (err) {
    console.error('Plugin error:', err);
    return { content: '❌ An error occurred. Please try again.' };
  }
}
```

### 2. Validate Input

```javascript
async handle(event, services) {
  if (!event.message.startsWith('/mycommand')) {
    return null;
  }

  const args = event.message.split(/\s+/).slice(1);
  if (args.length === 0) {
    return { content: 'Usage: /mycommand <arg>' };
  }

  // Process valid input
}
```

### 3. Use Early Return

```javascript
async handle(event, services) {
  // Skip non-matching events early
  if (!event.message.startsWith('/mycommand')) {
    return null;
  }

  // Main logic here
}
```

### 4. Keep It Simple

- One plugin = one feature
- Avoid complex state management
- Use storage for persistence

### 5. Document Your Plugin

```javascript
export default {
  name: 'my-plugin',
  description: 'Clear description of what the plugin does',
  version: '1.0.0',

  help() {
    return `
My Plugin

Commands:
  /mycommand <arg>    Description of command

Examples:
  /mycommand hello
    `.trim();
  }
};
```

## Publishing to Marketplace

### Step 1: Prepare Your Plugin

- [ ] Plugin has a unique name
- [ ] Plugin has a description
- [ ] Plugin has a version (semver)
- [ ] Plugin has help text
- [ ] Plugin handles errors gracefully
- [ ] Plugin is tested

### Step 2: Create a GitHub Repository

1. Create a new repository on GitHub
2. Add your plugin file(s)
3. Add a README.md with usage instructions
4. Create a release with the plugin file

### Step 3: Publish via Web UI

1. Visit the marketplace Web UI
2. Click "Publish" in the navigation
3. Fill in the plugin information
4. Upload your plugin file
5. Click "Publish"

### Step 4: Publish via API

```bash
# Create plugin
curl -X POST http://localhost:3001/api/plugins \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-plugin",
    "displayName": "My Plugin",
    "description": "A great plugin",
    "category": "tools"
  }'

# Publish version
curl -X POST http://localhost:3001/api/plugins/myuser/my-plugin/versions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "version=1.0.0" \
  -F "file=@my-plugin.js" \
  -F "changelog=Initial release"
```

## Security Considerations

### What's Allowed

- ✅ Using LLM service
- ✅ Using storage service
- ✅ Making HTTP requests (fetch/axios)
- ✅ Using npm packages (if bundled)

### What's Not Allowed

- ❌ `eval()` or `new Function()`
- ❌ File system access (`fs` module)
- ❌ Child process execution
- ❌ Accessing `process.env`
- ❌ Modifying global state

### Security Scanning

Your plugin will be automatically scanned for security issues before publishing. The scanner checks for:

- Dangerous code patterns
- Malicious behavior
- Permission violations

If the scan fails, you'll need to fix the issues before publishing.

## Example Plugins

### Simple Command Plugin

```javascript
export default {
  name: 'hello',
  description: 'Say hello',
  version: '1.0.0',

  async handle(event) {
    if (event.message === '/hello') {
      return { content: `Hello, ${event.nickname}! 👋` };
    }
    return null;
  }
};
```

### API Integration Plugin

```javascript
export default {
  name: 'joke',
  description: 'Get random jokes',
  version: '1.0.0',

  async handle(event) {
    if (event.message !== '/joke') {
      return null;
    }

    try {
      const response = await fetch('https://official-joke-api.appspot.com/random_joke');
      const joke = await response.json();
      return { content: `${joke.setup}\n\n${joke.punchline}` };
    } catch (err) {
      return { content: '❌ Failed to fetch joke' };
    }
  }
};
```

### AI-Powered Plugin

```javascript
export default {
  name: 'translator',
  description: 'Translate text using AI',
  version: '1.0.0',

  async handle(event, services) {
    if (!event.message.startsWith('/translate')) {
      return null;
    }

    const text = event.message.replace('/translate', '').trim();
    if (!text) {
      return { content: 'Usage: /translate <text>' };
    }

    const translation = await services.llm.chat([
      { role: 'system', content: 'Translate the following text to English.' },
      { role: 'user', content: text }
    ]);

    return { content: `🌐 Translation: ${translation}` };
  }
};
```

## Getting Help

- **Documentation**: Check this guide and the API documentation
- **Examples**: Look at existing plugins in the marketplace
- **Community**: Ask for help in the NNBot community
- **Issues**: Report bugs on GitHub
