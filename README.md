# Pixisphere Firebase Authentication API

A production-level authentication system built with Firebase Authentication, Node.js, Express, and MongoDB for the Pixisphere platform.

## Features

### Firebase Integration
- **Firebase Authentication**: Complete user management with Firebase
- **Custom Claims**: Role-based access control
- **Email Verification**: Automatic email verification through Firebase
- **Password Reset**: Firebase-handled password reset flow
- **Social Login**: Support for Google, Facebook, and other providers

### Security Features
- **Token Verification**: Firebase ID token verification
- **Rate Limiting**: IP-based rate limiting for API endpoints
- **Input Validation**: Joi schema validation
- **Data Sanitization**: XSS protection and input sanitization
- **Security Headers**: Helmet.js for security headers
- **Device Fingerprinting**: Track login devices and locations
- **Account Management**: Soft delete and account deactivation

### Database Features
- **MongoDB**: Document-based database with Mongoose ODM
- **Schema Validation**: Mongoose schema validation
- **Indexing**: Optimized database queries with proper indexing
- **Transactions**: ACID transactions for critical operations
- **Relationships**: Proper document relationships and population
- **In-Memory Caching**: Rate limiting and session management using in-memory storage

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register user in database after Firebase signup
- `POST /api/v1/auth/login` - Verify Firebase token and get user data
- `POST /api/v1/auth/logout` - Revoke Firebase refresh tokens
- `DELETE /api/v1/auth/delete-account` - Delete user account
- `POST /api/v1/auth/verify-email` - Update email verification status
- `GET /api/v1/auth/me` - Get current user information

### User Management
- `GET /api/v1/users/me` - Get current user profile
- `PATCH /api/v1/users/me` - Update user profile
- `POST /api/v1/users/upload-avatar` - Upload profile picture
- `GET /api/v1/users/:id` - Get public user profile
- `PATCH /api/v1/users/deactivate` - Deactivate user account

### Partner Management
- `GET /api/v1/partners/me` - Get partner profile
- `PATCH /api/v1/partners/me` - Update partner profile
- `POST /api/v1/partners/services` - Add service
- `PATCH /api/v1/partners/services/:id` - Update service
- `DELETE /api/v1/partners/services/:id` - Delete service
- `POST /api/v1/partners/documents` - Upload verification documents
- `GET /api/v1/partners` - Get all verified partners (public)
- `GET /api/v1/partners/:id` - Get single partner profile (public)

## Installation

1. **Clone the repository**

2. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

3. **Set up Firebase:**
   - Create a Firebase project
   - Enable Authentication
   - Download service account key
   - Place it as \`config/firebase-service-account.json\`

4. **Set up environment variables:**
   \`\`\`bash
   cp .env.example .env
   # Edit .env with your configuration
   \`\`\`

5. **Set up MongoDB:**
   - Install MongoDB or use MongoDB Atlas
   - Update MONGODB_URI in .env

6. **Start the server:**
   \`\`\`bash
   npm run dev  # Development
   npm start    # Production
   \`\`\`

## Firebase Setup

### Authentication Methods
Enable the following in Firebase Console:
- Email/Password
- Google (optional)
- Facebook (optional)

### Security Rules
Configure Firebase Security Rules for your project needs.

### Custom Claims
The system supports custom claims for role-based access:
\`\`\`javascript
{
  "userType": "client|partner|admin",
  "verified": true|false
}
\`\`\`

## Database Schema

### Users Collection
- Core user information synced with Firebase
- Soft delete functionality
- Device tracking and login history

### Partners Collection
- Partner-specific profile data
- Services and pricing information
- Verification documents
- Portfolio and ratings

### Clients Collection
- Client-specific data
- Favorite partners list

## Security Best Practices

1. **Firebase Security**
   - ID token verification on every request
   - Custom claims for authorization
   - Refresh token revocation on logout

2. **Database Security**
   - Mongoose schema validation
   - Input sanitization and XSS protection
   - Parameterized queries (built-in with Mongoose)

3. **API Security**
   - Rate limiting and progressive delays
   - Security headers with Helmet.js
   - CORS configuration
   - File upload restrictions

4. **Data Protection**
   - Soft delete for user accounts
   - Encrypted sensitive data storage
   - Audit trails for critical operations

## File Upload

The system supports file uploads for:
- Profile pictures (processed with Sharp)
- Partner verification documents
- Portfolio images

Files are processed and stored securely with proper validation.

## Error Handling

Comprehensive error handling with:
- Firebase-specific error codes
- MongoDB error handling
- Structured error responses
- Development vs production error details

## Testing

Run tests with:
\`\`\`bash
npm test
\`\`\`

## Production Deployment

1. Set \`NODE_ENV=production\`
2. Configure Firebase project for production
3. Set up MongoDB Atlas or production MongoDB
4. Configure proper CORS origins
5. Configure SSL/TLS termination
6. Set up monitoring and logging
7. Configure backup strategies

## Monitoring

The system includes:
- Health check endpoint
- Request logging with Morgan
- Error logging and tracking
- Performance monitoring capabilities

## API Documentation

All endpoints return JSON responses with the following structure:

\`\`\`json
{
  "success": boolean,
  "message": "string",
  "data": object // Optional
}
\`\`\`

Error responses include appropriate HTTP status codes and descriptive messages.
