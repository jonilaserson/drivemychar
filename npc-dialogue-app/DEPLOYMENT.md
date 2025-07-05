# Deployment Guide with Authentication

This guide will help you deploy the NPC Dialogue App with full authentication and ownership features.

## Prerequisites

- Google Cloud Console account
- MongoDB Atlas account
- Render account (for backend)
- Netlify account (for frontend)

## Step 1: Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API:
   - Go to "APIs & Services" → "Library"
   - Search for "Google+ API" and enable it
4. Create OAuth credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client IDs"
   - Choose "Web application"
   - Add authorized redirect URIs:
     - `https://your-backend-url.onrender.com/auth/google/callback`
     - `https://your-frontend-url.netlify.app/auth/callback`
5. Note down your Client ID and Client Secret

## Step 2: MongoDB Atlas Setup

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a free cluster
3. Create a database user with read/write permissions
4. Get your connection string (it looks like):
   ```
   mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
   ```

## Step 3: Backend Deployment (Render)

1. Push your code to GitHub
2. Connect your repository to Render
3. Set these environment variables in Render dashboard:

```
PORT=3000
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-here-make-it-long-and-random
SESSION_SECRET=your-super-secret-session-key-here-make-it-long-and-random
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/npc-dialogue-app?retryWrites=true&w=majority
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
FRONTEND_URL=https://your-frontend-app.netlify.app
ENABLE_AUTH=true
```

4. Deploy the backend

## Step 4: Frontend Deployment (Netlify)

1. In your frontend directory, create a `.env.production` file:

```
REACT_APP_USE_LOCAL_BACKEND=false
REACT_APP_BACKEND_URL=https://your-backend-url.onrender.com
```

2. Build and deploy to Netlify:
   ```bash
   cd frontend
   npm run build
   ```

3. Set up Netlify redirects for React Router:
   Create a `_redirects` file in the `public` directory:
   ```
   /*    /index.html   200
   ```

## Step 5: Update OAuth Redirect URIs

After deployment, update your Google OAuth redirect URIs with the actual URLs:
- Backend: `https://your-actual-backend-url.onrender.com/auth/google/callback`
- Frontend: `https://your-actual-frontend-url.netlify.app/auth/callback`

## How Authentication Works

### For Unauthenticated Users:
- Can access NPCs via direct links (e.g., `/character/neeno`)
- Can only use Player mode
- Cannot access GM features
- Cannot create or edit NPCs

### For Authenticated Users:
- Can log in with Google
- Can create new NPCs (automatically owned by them)
- Can see their owned NPCs in the character selector
- Can access GM mode only for NPCs they own
- Can edit their owned NPCs

### For NPC Owners (GMs):
- Full access to GM mode for their NPCs
- Can edit character details
- Can generate images
- Can manage conversation history

## Testing the Deployment

1. Visit your frontend URL
2. Try accessing a character directly: `https://your-frontend-url.netlify.app/character/neeno`
3. You should see Player mode only
4. Click "Sign in with Google" to authenticate
5. After login, you should see GM mode available for NPCs you own

## Troubleshooting

### Common Issues:

1. **CORS errors**: Make sure `FRONTEND_URL` is set correctly in backend
2. **OAuth redirect errors**: Check that redirect URIs match exactly
3. **Database connection**: Verify MongoDB connection string
4. **JWT errors**: Ensure JWT_SECRET is set and consistent

### Environment Variables Reference:

| Variable | Description | Required |
|----------|-------------|----------|
| `JWT_SECRET` | Secret key for JWT tokens | Yes |
| `SESSION_SECRET` | Secret key for sessions | Yes |
| `MONGODB_URI` | MongoDB connection string | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Yes |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Yes |
| `FRONTEND_URL` | Frontend URL for CORS | Yes |
| `ENABLE_AUTH` | Enable authentication (true/false) | No (default: false) |

## Security Notes

- Keep your JWT_SECRET and SESSION_SECRET secure and random
- Never commit .env files to version control
- Use HTTPS in production
- Regularly rotate your secrets
- Monitor your application logs for security issues 