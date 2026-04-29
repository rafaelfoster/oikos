function authSecurity() {
  return [{ bearerAuth: [] }, { apiKeyAuth: [] }, { cookieAuth: [] }];
}

function csrfHeaderParam() {
  return {
    name: 'X-CSRF-Token',
    in: 'header',
    required: false,
    description: 'Required for state-changing requests when using session/cookie authentication. Not required for API-token authentication.',
    schema: { type: 'string' },
  };
}

function jsonBody(schemaRef, description = 'JSON request body') {
  return {
    required: true,
    description,
    content: {
      'application/json': {
        schema: schemaRef ? { $ref: schemaRef } : { type: 'object', additionalProperties: true },
      },
    },
  };
}

function op({
  summary,
  tag,
  description,
  auth = true,
  admin = false,
  params = [],
  requestBody = null,
  responses = null,
  stateChanging = false,
}) {
  const operation = {
    tags: [tag],
    summary,
    responses: responses ?? {
      200: { description: 'Successful response' },
      401: { $ref: '#/components/responses/Unauthorized' },
      500: { $ref: '#/components/responses/InternalServerError' },
    },
  };

  if (description) operation.description = description;
  if (auth) operation.security = authSecurity();
  if (admin) {
    operation.description = `${operation.description ? `${operation.description}\n\n` : ''}Admin-only endpoint.`;
    operation.responses[403] = { $ref: '#/components/responses/Forbidden' };
  }
  if (params.length || stateChanging) {
    operation.parameters = [...params];
    if (stateChanging) operation.parameters.push(csrfHeaderParam());
  }
  if (requestBody) operation.requestBody = requestBody;
  return operation;
}

function idParam(name = 'id', description = 'Resource ID') {
  return {
    name,
    in: 'path',
    required: true,
    description,
    schema: { type: 'integer' },
  };
}

function langParam() {
  return {
    name: 'lang',
    in: 'query',
    required: false,
    description: 'Language code for localized labels. Supported values: ar, de, el, en, es, fr, hi, it, ja, pt, ru, sv, tr, uk, zh. Defaults to en.',
    schema: {
      type: 'string',
      default: 'en',
      enum: ['ar', 'de', 'el', 'en', 'es', 'fr', 'hi', 'it', 'ja', 'pt', 'ru', 'sv', 'tr', 'uk', 'zh'],
    },
  };
}

function buildPaths() {
  return {
    '/health': {
      get: op({
        summary: 'Health check',
        tag: 'System',
        auth: false,
        responses: {
          200: {
            description: 'Service health status',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } },
          },
        },
      }),
    },
    '/api/v1/version': {
      get: op({
        summary: 'Get application version',
        tag: 'System',
        auth: false,
        responses: {
          200: {
            description: 'Application version',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/VersionResponse' } } },
          },
        },
      }),
    },
    '/api/v1/openapi.json': {
      get: op({
        summary: 'Get OpenAPI specification',
        tag: 'System',
        auth: false,
        description: 'Use `?download=1` to receive the OpenAPI document as a downloadable file.',
      }),
    },
    '/openapi.json': {
      get: op({
        summary: 'Get OpenAPI specification',
        tag: 'System',
        auth: false,
        description: 'Alias for `/api/v1/openapi.json`. Use `?download=1` to download the JSON file.',
      }),
    },
    '/docs': {
      get: op({
        summary: 'Swagger UI documentation',
        tag: 'System',
        auth: false,
        responses: { 200: { description: 'Swagger UI HTML page' } },
      }),
    },
    '/api/v1/auth/login': {
      post: op({
        summary: 'Login with username and password',
        tag: 'Auth',
        auth: false,
        requestBody: jsonBody('#/components/schemas/LoginRequest'),
        responses: {
          200: {
            description: 'Authenticated user and CSRF token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      }),
    },
    '/api/v1/auth/logout': {
      post: op({ summary: 'Logout current session', tag: 'Auth', stateChanging: true }),
    },
    '/api/v1/auth/setup': {
      post: op({
        summary: 'Initial setup: create first admin',
        tag: 'Auth',
        auth: false,
        requestBody: jsonBody('#/components/schemas/SetupRequest'),
        responses: {
          201: { description: 'Admin user created' },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { description: 'Username already taken' },
        },
      }),
    },
    '/api/v1/auth/me': {
      get: op({
        summary: 'Get current authenticated user',
        tag: 'Auth',
        responses: {
          200: {
            description: 'Current user',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MeResponse' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      }),
    },
    '/api/v1/auth/me/password': {
      patch: op({
        summary: 'Change current user password',
        tag: 'Auth',
        stateChanging: true,
        requestBody: jsonBody('#/components/schemas/PasswordChangeRequest'),
      }),
    },
    '/api/v1/auth/me/profile': {
      patch: op({
        summary: 'Update current user profile',
        tag: 'Auth',
        stateChanging: true,
        requestBody: jsonBody('#/components/schemas/ProfileUpdateRequest'),
      }),
    },
    '/api/v1/auth/users': {
      get: op({ summary: 'List users', tag: 'Auth', admin: true }),
      post: op({
        summary: 'Create user',
        tag: 'Auth',
        admin: true,
        stateChanging: true,
        requestBody: jsonBody('#/components/schemas/UserCreateRequest'),
        responses: {
          201: { description: 'User created' },
          400: { $ref: '#/components/responses/BadRequest' },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { description: 'Username already taken' },
          500: { $ref: '#/components/responses/InternalServerError' },
        },
      }),
    },
    '/api/v1/auth/users/{id}': {
      patch: op({
        summary: 'Update user',
        tag: 'Auth',
        admin: true,
        stateChanging: true,
        params: [idParam('id', 'User ID')],
        requestBody: jsonBody('#/components/schemas/UserUpdateRequest'),
      }),
      delete: op({
        summary: 'Delete user',
        tag: 'Auth',
        admin: true,
        stateChanging: true,
        params: [idParam('id', 'User ID')],
      }),
    },
    '/api/v1/auth/api-tokens': {
      get: op({ summary: 'List API tokens', tag: 'Auth', admin: true }),
      post: op({
        summary: 'Create API token',
        tag: 'Auth',
        admin: true,
        stateChanging: true,
        requestBody: jsonBody('#/components/schemas/ApiTokenCreateRequest'),
        responses: {
          201: {
            description: 'API token created. The plaintext token is returned only once.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiTokenCreateResponse' } } },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          403: { $ref: '#/components/responses/Forbidden' },
          500: { $ref: '#/components/responses/InternalServerError' },
        },
      }),
    },
    '/api/v1/auth/api-tokens/{id}': {
      delete: op({
        summary: 'Revoke API token',
        tag: 'Auth',
        admin: true,
        stateChanging: true,
        params: [idParam('id', 'API token ID')],
      }),
    },
    '/api/v1/family/members': {
      get: op({
        summary: 'List family members',
        tag: 'Family',
        description: 'Read-only endpoint for family-member profiles. It does not expose usernames or system access roles and does not support create/update/delete operations.',
        responses: {
          200: {
            description: 'Family members',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/FamilyMembersResponse' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          500: { $ref: '#/components/responses/InternalServerError' },
        },
      }),
    },
    '/api/v1/dashboard': { get: op({ summary: 'Get dashboard data', tag: 'Dashboard' }) },
    '/api/v1/tasks': {
      get: op({ summary: 'List tasks', tag: 'Tasks' }),
      post: op({ summary: 'Create task', tag: 'Tasks', stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/tasks/meta/options': { get: op({ summary: 'Get task metadata', tag: 'Tasks' }) },
    '/api/v1/tasks/{id}': {
      get: op({ summary: 'Get task', tag: 'Tasks', params: [idParam()] }),
      put: op({ summary: 'Update task', tag: 'Tasks', params: [idParam()], stateChanging: true, requestBody: jsonBody(null) }),
      delete: op({ summary: 'Delete task', tag: 'Tasks', params: [idParam()], stateChanging: true }),
    },
    '/api/v1/tasks/{id}/status': {
      patch: op({ summary: 'Update task status', tag: 'Tasks', params: [idParam()], stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/shopping': {
      get: op({ summary: 'List shopping lists', tag: 'Shopping' }),
      post: op({ summary: 'Create shopping list', tag: 'Shopping', stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/shopping/categories': {
      get: op({ summary: 'List shopping categories', tag: 'Shopping' }),
      post: op({ summary: 'Create shopping category', tag: 'Shopping', stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/shopping/categories/{catId}': {
      put: op({ summary: 'Update shopping category', tag: 'Shopping', params: [idParam('catId', 'Category ID')], stateChanging: true, requestBody: jsonBody(null) }),
      delete: op({ summary: 'Delete shopping category', tag: 'Shopping', params: [idParam('catId', 'Category ID')], stateChanging: true }),
    },
    '/api/v1/shopping/categories/reorder': {
      patch: op({ summary: 'Reorder shopping categories', tag: 'Shopping', stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/shopping/suggestions': { get: op({ summary: 'Get shopping suggestions', tag: 'Shopping' }) },
    '/api/v1/shopping/items/{itemId}': {
      patch: op({ summary: 'Update shopping item', tag: 'Shopping', params: [idParam('itemId', 'Item ID')], stateChanging: true, requestBody: jsonBody(null) }),
      delete: op({ summary: 'Delete shopping item', tag: 'Shopping', params: [idParam('itemId', 'Item ID')], stateChanging: true }),
    },
    '/api/v1/shopping/{listId}': {
      put: op({ summary: 'Rename shopping list', tag: 'Shopping', params: [idParam('listId', 'List ID')], stateChanging: true, requestBody: jsonBody(null) }),
      delete: op({ summary: 'Delete shopping list', tag: 'Shopping', params: [idParam('listId', 'List ID')], stateChanging: true }),
    },
    '/api/v1/shopping/{listId}/items': {
      get: op({ summary: 'List items in shopping list', tag: 'Shopping', params: [idParam('listId', 'List ID')] }),
      post: op({ summary: 'Add item to shopping list', tag: 'Shopping', params: [idParam('listId', 'List ID')], stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/shopping/{listId}/items/checked': {
      delete: op({ summary: 'Delete checked shopping items', tag: 'Shopping', params: [idParam('listId', 'List ID')], stateChanging: true }),
    },
    '/api/v1/meals': {
      get: op({ summary: 'List meal plan entries', tag: 'Meals' }),
      post: op({ summary: 'Create meal plan entry', tag: 'Meals', stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/meals/suggestions': { get: op({ summary: 'Get meal suggestions', tag: 'Meals' }) },
    '/api/v1/meals/{id}': {
      put: op({ summary: 'Update meal plan entry', tag: 'Meals', params: [idParam()], stateChanging: true, requestBody: jsonBody(null) }),
      delete: op({ summary: 'Delete meal plan entry', tag: 'Meals', params: [idParam()], stateChanging: true }),
    },
    '/api/v1/meals/{id}/ingredients': {
      post: op({ summary: 'Add meal ingredient', tag: 'Meals', params: [idParam()], stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/meals/ingredients/{ingId}': {
      patch: op({ summary: 'Update meal ingredient', tag: 'Meals', params: [idParam('ingId', 'Ingredient ID')], stateChanging: true, requestBody: jsonBody(null) }),
      delete: op({ summary: 'Delete meal ingredient', tag: 'Meals', params: [idParam('ingId', 'Ingredient ID')], stateChanging: true }),
    },
    '/api/v1/meals/{id}/to-shopping-list': {
      post: op({ summary: 'Transfer meal ingredients to shopping list', tag: 'Meals', params: [idParam()], stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/meals/week-to-shopping-list': {
      post: op({ summary: 'Transfer weekly meal ingredients to shopping list', tag: 'Meals', stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/recipes': {
      get: op({ summary: 'List recipes', tag: 'Recipes' }),
      post: op({ summary: 'Create recipe', tag: 'Recipes', stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/recipes/{id}': {
      put: op({ summary: 'Update recipe', tag: 'Recipes', params: [idParam()], stateChanging: true, requestBody: jsonBody(null) }),
      delete: op({ summary: 'Delete recipe', tag: 'Recipes', params: [idParam()], stateChanging: true }),
    },
    '/api/v1/calendar': {
      get: op({ summary: 'List calendar events', tag: 'Calendar' }),
      post: op({ summary: 'Create calendar event', tag: 'Calendar', stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/calendar/upcoming': { get: op({ summary: 'List upcoming events', tag: 'Calendar' }) },
    '/api/v1/calendar/google/auth': { get: op({ summary: 'Start Google Calendar OAuth', tag: 'Calendar', admin: true }) },
    '/api/v1/calendar/google/callback': { get: op({ summary: 'Google Calendar OAuth callback', tag: 'Calendar', auth: false }) },
    '/api/v1/calendar/google/sync': { post: op({ summary: 'Run Google Calendar sync', tag: 'Calendar', admin: true, stateChanging: true }) },
    '/api/v1/calendar/google/status': { get: op({ summary: 'Get Google Calendar status', tag: 'Calendar' }) },
    '/api/v1/calendar/google/disconnect': { delete: op({ summary: 'Disconnect Google Calendar', tag: 'Calendar', admin: true, stateChanging: true }) },
    '/api/v1/calendar/apple/status': { get: op({ summary: 'Get Apple Calendar status', tag: 'Calendar' }) },
    '/api/v1/calendar/apple/sync': { post: op({ summary: 'Run Apple Calendar sync', tag: 'Calendar', admin: true, stateChanging: true }) },
    '/api/v1/calendar/apple/connect': { post: op({ summary: 'Connect Apple Calendar', tag: 'Calendar', admin: true, stateChanging: true, requestBody: jsonBody(null) }) },
    '/api/v1/calendar/apple/disconnect': { delete: op({ summary: 'Disconnect Apple Calendar', tag: 'Calendar', admin: true, stateChanging: true }) },
    '/api/v1/calendar/subscriptions': {
      get: op({ summary: 'List ICS subscriptions', tag: 'Calendar' }),
      post: op({ summary: 'Create ICS subscription', tag: 'Calendar', stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/calendar/subscriptions/{id}': {
      patch: op({ summary: 'Update ICS subscription', tag: 'Calendar', params: [idParam()], stateChanging: true, requestBody: jsonBody(null) }),
      delete: op({ summary: 'Delete ICS subscription', tag: 'Calendar', params: [idParam()], stateChanging: true }),
    },
    '/api/v1/calendar/subscriptions/{id}/sync': {
      post: op({ summary: 'Sync ICS subscription', tag: 'Calendar', params: [idParam()], stateChanging: true }),
    },
    '/api/v1/calendar/{id}': {
      get: op({ summary: 'Get calendar event', tag: 'Calendar', params: [idParam()] }),
      put: op({ summary: 'Update calendar event', tag: 'Calendar', params: [idParam()], stateChanging: true, requestBody: jsonBody(null) }),
      delete: op({ summary: 'Delete calendar event', tag: 'Calendar', params: [idParam()], stateChanging: true }),
    },
    '/api/v1/calendar/{id}/reset': {
      post: op({ summary: 'Reset external calendar event to source state', tag: 'Calendar', params: [idParam()], stateChanging: true }),
    },
    '/api/v1/notes': {
      get: op({ summary: 'List notes', tag: 'Notes' }),
      post: op({ summary: 'Create note', tag: 'Notes', stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/notes/{id}': {
      put: op({ summary: 'Update note', tag: 'Notes', params: [idParam()], stateChanging: true, requestBody: jsonBody(null) }),
      delete: op({ summary: 'Delete note', tag: 'Notes', params: [idParam()], stateChanging: true }),
    },
    '/api/v1/notes/{id}/pin': {
      patch: op({ summary: 'Toggle note pin state', tag: 'Notes', params: [idParam()], stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/contacts': {
      get: op({ summary: 'List contacts', tag: 'Contacts' }),
      post: op({ summary: 'Create contact', tag: 'Contacts', stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/contacts/meta': { get: op({ summary: 'Get contact metadata', tag: 'Contacts' }) },
    '/api/v1/contacts/{id}': {
      put: op({ summary: 'Update contact', tag: 'Contacts', params: [idParam()], stateChanging: true, requestBody: jsonBody(null) }),
      delete: op({ summary: 'Delete contact', tag: 'Contacts', params: [idParam()], stateChanging: true }),
    },
    '/api/v1/contacts/{id}/vcard': { get: op({ summary: 'Download contact as vCard', tag: 'Contacts', params: [idParam()] }) },
    '/api/v1/birthdays': {
      get: op({ summary: 'List birthdays', tag: 'Birthdays' }),
      post: op({ summary: 'Create birthday', tag: 'Birthdays', stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/birthdays/upcoming': {
      get: op({ summary: 'List upcoming birthdays', tag: 'Birthdays' }),
    },
    '/api/v1/birthdays/meta/options': {
      get: op({ summary: 'Get birthday upload options', tag: 'Birthdays' }),
    },
    '/api/v1/birthdays/{id}': {
      put: op({ summary: 'Update birthday', tag: 'Birthdays', params: [idParam()], stateChanging: true, requestBody: jsonBody(null) }),
      delete: op({ summary: 'Delete birthday', tag: 'Birthdays', params: [idParam()], stateChanging: true }),
    },
    '/api/v1/budget/summary': { get: op({ summary: 'Get budget summary', tag: 'Budget' }) },
    '/api/v1/budget/export': { get: op({ summary: 'Export budget entries as CSV', tag: 'Budget' }) },
    '/api/v1/budget/meta': { get: op({ summary: 'Get budget categories and subcategories', tag: 'Budget' }) },
    '/api/v1/budget/categories': {
      get: op({ summary: 'List budget categories', tag: 'Budget', params: [langParam()] }),
      post: op({ summary: 'Create budget category', tag: 'Budget', stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/budget/categories/{categoryKey}/subcategories': {
      get: op({ summary: 'List subcategories for a budget category', tag: 'Budget', params: [{ name: 'categoryKey', in: 'path', required: true, schema: { type: 'string' } }, langParam()] }),
      post: op({ summary: 'Create budget subcategory', tag: 'Budget', params: [{ name: 'categoryKey', in: 'path', required: true, schema: { type: 'string' } }], stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/budget': {
      get: op({ summary: 'List budget entries', tag: 'Budget' }),
      post: op({ summary: 'Create budget entry', tag: 'Budget', stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/budget/{id}': {
      put: op({ summary: 'Update budget entry', tag: 'Budget', params: [idParam()], stateChanging: true, requestBody: jsonBody(null) }),
      delete: op({ summary: 'Delete budget entry', tag: 'Budget', params: [idParam()], stateChanging: true }),
    },
    '/api/v1/weather': { get: op({ summary: 'Get weather data', tag: 'Weather' }) },
    '/api/v1/weather/icon/{code}': {
      get: op({ summary: 'Get weather icon asset', tag: 'Weather', params: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }] }),
    },
    '/api/v1/preferences': {
      get: op({ summary: 'Get user preferences', tag: 'Preferences' }),
      put: op({ summary: 'Update user preferences', tag: 'Preferences', stateChanging: true, requestBody: jsonBody(null) }),
    },
    '/api/v1/reminders/pending': { get: op({ summary: 'List pending reminders', tag: 'Reminders' }) },
    '/api/v1/reminders': {
      get: op({ summary: 'List reminders', tag: 'Reminders' }),
      post: op({ summary: 'Create reminder', tag: 'Reminders', stateChanging: true, requestBody: jsonBody(null) }),
      delete: op({ summary: 'Delete reminders by filter', tag: 'Reminders', stateChanging: true }),
    },
    '/api/v1/reminders/{id}/dismiss': {
      patch: op({ summary: 'Dismiss reminder', tag: 'Reminders', params: [idParam()], stateChanging: true }),
    },
    '/api/v1/reminders/{id}': {
      delete: op({ summary: 'Delete reminder', tag: 'Reminders', params: [idParam()], stateChanging: true }),
    },
    '/api/v1/search': { get: op({ summary: 'Search across modules', tag: 'Search' }) },
  };
}

function buildOpenApiSpec(req, appVersion) {
  const origin = `${req.protocol}://${req.get('host')}`;

  return {
    openapi: '3.1.0',
    info: {
      title: 'Oikos API',
      version: appVersion,
      description: 'OpenAPI documentation for the Oikos family organizer backend.',
    },
    servers: [
      { url: origin, description: 'Current server' },
    ],
    tags: [
      { name: 'System' },
      { name: 'Auth' },
      { name: 'Family' },
      { name: 'Dashboard' },
      { name: 'Tasks' },
      { name: 'Shopping' },
      { name: 'Meals' },
      { name: 'Recipes' },
      { name: 'Calendar' },
      { name: 'Notes' },
      { name: 'Contacts' },
      { name: 'Birthdays' },
      { name: 'Budget' },
      { name: 'Weather' },
      { name: 'Preferences' },
      { name: 'Reminders' },
      { name: 'Search' },
    ],
    paths: buildPaths(),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API token sent in the Authorization header as `Bearer <token>`.',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API token sent in the `X-API-Key` header.',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'oikos.sid',
          description: 'Browser session cookie. State-changing requests also require `X-CSRF-Token`.',
        },
      },
      responses: {
        BadRequest: {
          description: 'Bad request',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
        },
        Unauthorized: {
          description: 'Authentication required or invalid credentials/token',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
        },
        Forbidden: {
          description: 'Permission denied',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
        },
        InternalServerError: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
        },
      },
      schemas: {
        ApiError: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'integer' },
          },
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'ok' },
            timestamp: { type: 'string', format: 'date-time' },
          },
          required: ['status', 'timestamp'],
        },
        VersionResponse: {
          type: 'object',
          properties: {
            version: { type: 'string' },
          },
          required: ['version'],
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            username: { type: 'string' },
            display_name: { type: 'string' },
            avatar_color: { type: 'string' },
            avatar_data: { type: ['string', 'null'], description: 'PNG, JPEG, or WebP data URL.' },
            role: { type: 'string', enum: ['admin', 'member'] },
            family_role: { type: 'string', enum: ['dad', 'mom', 'parent', 'child', 'grandparent', 'relative', 'other'] },
            phone: { type: ['string', 'null'] },
            email: { type: ['string', 'null'] },
            birth_date: { type: ['string', 'null'], format: 'date' },
          },
          required: ['id', 'username', 'display_name', 'avatar_color', 'role', 'family_role'],
        },
        FamilyMember: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            display_name: { type: 'string' },
            avatar_color: { type: 'string' },
            avatar_data: { type: ['string', 'null'], description: 'PNG, JPEG, or WebP data URL.' },
            family_role: { type: 'string', enum: ['dad', 'mom', 'parent', 'child', 'grandparent', 'relative', 'other'] },
            phone: { type: ['string', 'null'] },
            email: { type: ['string', 'null'] },
            birth_date: { type: ['string', 'null'], format: 'date' },
            created_at: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'display_name', 'avatar_color', 'family_role'],
        },
        FamilyMembersResponse: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/FamilyMember' },
            },
          },
          required: ['data'],
        },
        LoginRequest: {
          type: 'object',
          properties: {
            username: { type: 'string' },
            password: { type: 'string' },
          },
          required: ['username', 'password'],
        },
        LoginResponse: {
          type: 'object',
          properties: {
            user: { $ref: '#/components/schemas/User' },
            csrfToken: { type: 'string' },
          },
          required: ['user', 'csrfToken'],
        },
        MeResponse: {
          type: 'object',
          properties: {
            user: { $ref: '#/components/schemas/User' },
            csrfToken: { type: 'string' },
          },
          required: ['user'],
        },
        SetupRequest: {
          type: 'object',
          properties: {
            username: { type: 'string' },
            display_name: { type: 'string' },
            password: { type: 'string' },
          },
          required: ['username', 'display_name', 'password'],
        },
        PasswordChangeRequest: {
          type: 'object',
          properties: {
            currentPassword: { type: 'string' },
            newPassword: { type: 'string' },
          },
          required: ['currentPassword', 'newPassword'],
        },
        UserCreateRequest: {
          type: 'object',
          properties: {
            username: { type: 'string' },
            display_name: { type: 'string' },
            password: { type: 'string' },
            avatar_color: { type: 'string' },
            avatar_data: { type: ['string', 'null'], description: 'PNG, JPEG, or WebP data URL.' },
            family_role: { type: 'string', enum: ['dad', 'mom', 'parent', 'child', 'grandparent', 'relative', 'other'] },
            system_admin: { type: 'boolean' },
            phone: { type: ['string', 'null'] },
            email: { type: ['string', 'null'] },
            birth_date: { type: ['string', 'null'], format: 'date' },
          },
          required: ['username', 'display_name', 'password'],
        },
        UserUpdateRequest: {
          type: 'object',
          properties: {
            username: { type: 'string' },
            display_name: { type: 'string' },
            avatar_color: { type: 'string' },
            avatar_data: { type: ['string', 'null'], description: 'PNG, JPEG, or WebP data URL. Use null to remove.' },
            family_role: { type: 'string', enum: ['dad', 'mom', 'parent', 'child', 'grandparent', 'relative', 'other'] },
            system_admin: { type: 'boolean' },
            phone: { type: ['string', 'null'] },
            email: { type: ['string', 'null'] },
            birth_date: { type: ['string', 'null'], format: 'date' },
          },
        },
        ProfileUpdateRequest: {
          type: 'object',
          properties: {
            display_name: { type: 'string' },
            avatar_color: { type: 'string' },
            avatar_data: { type: ['string', 'null'], description: 'PNG, JPEG, or WebP data URL. Use null to remove.' },
          },
        },
        ApiToken: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            token_prefix: { type: 'string' },
            created_by: { type: 'integer' },
            creator_name: { type: 'string' },
            expires_at: { type: ['string', 'null'], format: 'date-time' },
            revoked_at: { type: ['string', 'null'], format: 'date-time' },
            last_used_at: { type: ['string', 'null'], format: 'date-time' },
            created_at: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'name', 'token_prefix', 'created_by', 'created_at'],
        },
        ApiTokenCreateRequest: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            expires_at: { type: ['string', 'null'], format: 'date-time' },
          },
          required: ['name'],
        },
        ApiTokenCreateResponse: {
          type: 'object',
          properties: {
            data: { $ref: '#/components/schemas/ApiToken' },
            token: { type: 'string' },
          },
          required: ['data', 'token'],
        },
      },
    },
  };
}

export { buildOpenApiSpec };
