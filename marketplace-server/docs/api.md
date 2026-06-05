# Marketplace Server API Documentation

## Overview

The Marketplace Server provides a RESTful API for managing plugins in the NNBot plugin marketplace.

**Base URL**: `http://localhost:3001`

## Authentication

Most endpoints require authentication via JWT token. Include the token in the Authorization header:

```
Authorization: Bearer <token>
```

### Getting a Token

1. Visit `/api/auth/github` to start GitHub OAuth flow
2. After authentication, you'll receive a JWT token
3. Use this token for authenticated requests

## Endpoints

### Authentication

#### GET /api/auth/github

Start GitHub OAuth authentication.

**Response**: Redirect to GitHub OAuth page

#### GET /api/auth/github/callback

Handle GitHub OAuth callback.

**Query Parameters**:
- `code` (string): OAuth code from GitHub
- `state` (string): State parameter for CSRF protection

**Response**: Redirect with token in URL parameter

#### GET /api/auth/me

Get current user information.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "testuser",
    "displayName": "Test User",
    "avatarUrl": "https://avatars.githubusercontent.com/u/12345"
  }
}
```

#### POST /api/auth/refresh

Refresh JWT token.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "data": {
    "token": "new-jwt-token"
  }
}
```

### Plugins

#### GET /api/plugins

List plugins with search and filters.

**Query Parameters**:
- `q` (string): Search query
- `category` (string): Filter by category
- `tags` (string): Comma-separated tags
- `minRating` (number): Minimum rating
- `sortBy` (string): Sort field (downloads, rating, updated, created)
- `sortOrder` (string): Sort order (asc, desc)
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20, max: 100)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "username/plugin-name",
      "name": "plugin-name",
      "displayName": "Plugin Name",
      "description": "Plugin description",
      "version": "1.0.0",
      "author": "username",
      "category": "tools",
      "tags": ["tag1", "tag2"],
      "downloads": 1000,
      "rating": 4.5,
      "ratingCount": 10,
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### GET /api/plugins/popular

Get popular plugins.

**Query Parameters**:
- `limit` (number): Number of plugins (default: 10, max: 50)

**Response**: Same as GET /api/plugins

#### GET /api/plugins/recommended

Get recommended plugins.

**Query Parameters**:
- `limit` (number): Number of plugins (default: 10, max: 50)

**Response**: Same as GET /api/plugins

#### GET /api/plugins/:id

Get plugin detail.

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "username/plugin-name",
    "name": "plugin-name",
    "displayName": "Plugin Name",
    "description": "Plugin description",
    "version": "1.0.0",
    "author": "username",
    "category": "tools",
    "tags": ["tag1", "tag2"],
    "downloads": 1000,
    "rating": 4.5,
    "ratingCount": 10,
    "updatedAt": "2024-01-01T00:00:00Z",
    "readme": "# Plugin Name\n\nPlugin description...",
    "changelog": "## v1.0.0\n\nInitial release",
    "versions": [...],
    "dependencies": [...],
    "permissions": [...],
    "license": "MIT",
    "homepage": "https://example.com",
    "repository": "https://github.com/user/repo"
  }
}
```

#### POST /api/plugins

Create a new plugin.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "name": "plugin-name",
  "displayName": "Plugin Name",
  "description": "Plugin description",
  "category": "tools",
  "tags": ["tag1", "tag2"],
  "license": "MIT",
  "homepage": "https://example.com",
  "repository": "https://github.com/user/repo"
}
```

**Response**: Plugin detail (201 Created)

#### PUT /api/plugins/:id

Update a plugin.

**Headers**: `Authorization: Bearer <token>`

**Request Body**: Same as POST /api/plugins (all fields optional)

**Response**: Updated plugin detail

#### DELETE /api/plugins/:id

Delete a plugin.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "message": "Plugin deleted"
}
```

### Versions

#### GET /api/plugins/:id/versions

Get all versions for a plugin.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "version": "1.0.0",
      "releasedAt": "2024-01-01T00:00:00Z",
      "changelog": "Initial release",
      "downloadUrl": "https://github.com/...",
      "checksum": "abc123..."
    }
  ]
}
```

#### GET /api/plugins/:id/versions/:version

Get specific version.

**Response**: Version detail

#### POST /api/plugins/:id/versions

Publish a new version.

**Headers**: `Authorization: Bearer <token>`

**Request Body**: Multipart form data
- `version` (string): Version number (semver)
- `changelog` (string): Version changelog
- `file` (file): Plugin file (.js)
- `dependencies` (string): JSON array of dependencies
- `permissions` (string): JSON array of permissions

**Response**: Version detail (201 Created)

#### GET /api/plugins/:id/download/:version

Download a plugin version.

**Response**: Redirect to download URL (302)

### Search

#### GET /api/search

Search plugins.

**Query Parameters**: Same as GET /api/plugins

**Response**: Same as GET /api/plugins

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message"
}
```

### Common Error Codes

- **400 Bad Request**: Invalid input
- **401 Unauthorized**: Missing or invalid authentication
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **409 Conflict**: Resource already exists
- **422 Unprocessable Entity**: Validation failed
- **500 Internal Server Error**: Server error

## Rate Limiting

API endpoints are rate limited to prevent abuse:

- **Authenticated requests**: 100 requests per minute
- **Unauthenticated requests**: 20 requests per minute

When rate limited, you'll receive a 429 Too Many Requests response.

## Pagination

List endpoints support pagination:

```json
{
  "success": true,
  "data": [...],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

Use `page` and `limit` query parameters to navigate through results.
