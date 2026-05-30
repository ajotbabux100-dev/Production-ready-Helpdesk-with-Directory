# Excel Data Manager

A web application for managing Excel data with role-based access control (Admin and User roles).

## Features

- **User Authentication**: Secure login system with role-based access
- **Admin Features**:
  - Add new data entries
  - Edit existing data
  - Delete data entries
- **User Features**:
  - View all data
  - Copy data rows to clipboard
- **Export**: Download data as Excel (.xlsx) file
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm

### Setup

1. Navigate to the project directory:
```bash
cd excel-data-app
```

2. Install dependencies:
```bash
npm install
```

3. Run the server:
```bash
npm start
```

The application will start on `http://localhost:3000`

## Demo Credentials

### Admin Account
- **Username**: admin
- **Password**: admin123

### User Account
- **Username**: user
- **Password**: user123

## Project Structure

```
excel-data-app/
├── server.js          # Express server and API endpoints
├── package.json       # Dependencies
├── public/
│   ├── login.html     # Login page
│   └── dashboard.html # Main dashboard page
└── data/
    └── app.db         # SQLite database (created on first run)
```

## API Endpoints

### Authentication
- `POST /api/login` - User login
- `GET /logout` - User logout

### Data Management
- `GET /api/data` - Get all data
- `POST /api/data` - Add new data (admin only)
- `PUT /api/data/:id` - Update data (admin only)
- `DELETE /api/data/:id` - Delete data (admin only)
- `GET /api/export` - Export data to Excel

### User Info
- `GET /api/user` - Get current logged-in user info

## Database Schema

### Users Table
- `id` - Primary key
- `username` - Unique username
- `password` - Bcrypt hashed password
- `role` - 'admin' or 'user'
- `created_at` - Account creation timestamp

### Data Table
- `id` - Primary key
- `column1-5` - Data columns
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

## Security Features

- Passwords are hashed using bcryptjs
- Session-based authentication
- Role-based access control (RBAC)
- SQL injection protection via parameterized queries

## Customization

### Change Admin Password
Modify the default password in `server.js` line (search for "admin123"):
```javascript
const hashedPassword = bcrypt.hashSync('your-new-password', 10);
```

### Modify Session Secret
Change the session secret in `server.js` line:
```javascript
secret: 'your-secure-secret-key'
```

### Change Port
Set the `PORT` environment variable:
```bash
set PORT=5000
npm start
```

Or modify in `server.js`:
```javascript
const PORT = process.env.PORT || 3000;
```

## Browser Compatibility

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Troubleshooting

### Port already in use
```bash
# Windows: Find and kill the process on port 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :3000
kill -9 <PID>
```

### Database issues
Delete the `data/app.db` file and restart the server to recreate the database.

### Module not found
Ensure all dependencies are installed:
```bash
npm install
```

## License

ISC
