Start both the backend and frontend servers for local development and testing.

1. Kill any existing processes on ports 8000 and 3000
2. Start the backend server: `cd ProjectCode/server && source venv/bin/activate && python main.py` (run in background)
3. Start the frontend server: `cd ProjectCode/client && npm start` (run in background)
4. Wait a few seconds, then check both servers are running and report their URLs
